var EXPORTED_SYMBOLS = ["Imgur"];
Components.utils.import("resource://imgurfox/oauth.jsm");

let windowManager =
  Components
    .classes['@mozilla.org/appshell/window-mediator;1']
    .getService(Components.interfaces.nsIWindowMediator);

  let passwordManager =
    Components
      .classes["@mozilla.org/login-manager;1"]
      .getService(Components.interfaces.nsILoginManager);
              
  let nsLoginInfo =
    new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                               Components.interfaces.nsILoginInfo, "init");

  let nativeJSON =
    Components
      .classes["@mozilla.org/dom/json;1"]
      .createInstance(Components.interfaces.nsIJSON);

function getBrowser() {
  return windowManager.getMostRecentWindow("navigator:browser").gBrowser;
}

var Imgur = {
  apiKey: "24bf6070f45ed716e8cf9324baebddbd",
  
  transload: function(src, edit) {
    let browser = getBrowser();
    if (this.oauth.isAuthenticated) {
      let msg = {
        method: "POST",
        action: "http://api.imgur.com/2/account/images.json",
        parameters: {
          image: src,
          type: "url"
        }
      };
      if (edit) { windowManager.getMostRecentWindow("navigator:browser").alert("FIXME: no authenticated edit support yet. :("); }
      this.oauth.authenticateMsg(msg);
      Imgur._request(
        msg,
        function(req) {
          data = nativeJSON.decode(req.responseText);
          browser.selectedTab = browser.addTab(data.images.links.imgur_page);
        }
      );
    } else {
      let msg = {
        method: "GET",
        action: "http://api.imgur.com/2/upload",
        parameters: {
          key: this.apiKey,
          url: src
        }
      };
      if (edit) { msg.parameters.edit = edit; }
      browser.selectedTab = browser.addTab(this._url(msg));
    }
  },

  upload: function(base64data) {
    let msg = {
      method: "POST",
      action: "http://api.imgur.com/2/upload.json",
      parameters: {
        image: base64data,
        type: "base64"
      }
    };
    
    if (this.oauth.isAuthenticated) {
      msg.action = "http://api.imgur.com/2/account/images.json";
      this.oauth.authenticateMsg(msg);
    } else {
      msg.parameters.key = this.apiKey;
    }
    
    let browser = getBrowser(),
        imageTab = browser.selectedTab = browser.addTab("http://imgur.com/working/");
    Imgur._request(
      msg,
      function(req) {
        data = nativeJSON.decode(req.responseText);
        browser.getBrowserForTab(imageTab).loadURI((data.upload || data.images).links.imgur_page);
      }
    );
  },
  
  oauth: {
    isAuthenticated: false,
    
    _newAuthData: function() {
      return {
        consumerKey: "bd42978fb83a5ab9ad4ce2c23e6a109d04c89f835",
        consumerSecret: "a228260c6a2057edaf343e4b7ed83fa9"
      };
    },

    load: function() {
      let savedLoginInfo = this.storage.load();
      if (savedLoginInfo) {
        this.authData = this._newAuthData();
        this.authData.token = savedLoginInfo.username;
        this.authData.tokenSecret = savedLoginInfo.password;
        this.isAuthenticated = true;
      }
    },
    
    forget: function() {
      this.storage.clear();
      this.authData = this._newAuthData();
      this.isAuthenticated = false;
    },
    
    authorize: function(statusCallback) {
      function requestToken(callback) {
        Imgur.oauth.authData = Imgur.oauth._newAuthData();
        Imgur.oauth._tokenRequest("https://api.imgur.com/oauth/request_token", callback);
      }
      
      function authorizeWithUser(callback) {
        // Using that request token, open the authorize page and wait for user feedback.
        let browser = getBrowser();
            target = Imgur._url(Imgur.oauth.authenticateMsg({action: "http://api.imgur.com/oauth/authorize"})),
            authorizeTab = browser.selectedTab = browser.addTab(target),
            authorizeBrowser = browser.getBrowserForTab(authorizeTab);
        
        browser.getBrowserForTab(authorizeTab).addEventListener("load", function() {
          let doc = authorizeBrowser.contentDocument,
              heading = doc.getElementsByTagName("h1")[0],
              allow = null;
          
          if (/\bdenied\b/.test(heading.className)) {
            allow = false;
          } else if (/\ballowed\b/.test(heading.className)) {
            allow = true;
          }
          
          if (allow != null) {
            browser.getBrowserForTab(authorizeTab).removeEventListener("load", arguments.callee, true);
            callback(allow);
          }
        }, true);
      }
      
      function accessToken(callback) {
        Imgur.oauth._tokenRequest("https://api.imgur.com/oauth/access_token", callback);
      }
      
      this.forget();
      
      // Let's do this thing!
      let self = this;
      statusCallback("request");
      requestToken(function() {
        statusCallback("authorize");
        authorizeWithUser(function(allow) {
          if (allow) {
            statusCallback("allowed");
            statusCallback("access");
            accessToken(function() {
              statusCallback("success");
              self.isAuthenticated = true;
              self.storage.save(self.authData);
            });
          } else {
            statusCallback("denied");
          }
        });
      });
    },
    
    authenticateMsg: function(msg) {
      OAuth.completeRequest(msg, this.authData);
      OAuth.SignatureMethod.sign(msg, this.authData);
      return msg;
    },
    
    _tokenRequest: function(action, callback) {
      var self = this;
      Imgur._request(
        this.authenticateMsg({method: "GET", action: action}),
        function(req) {
          resp = OAuth.getParameterMap(req.responseText);
          if (resp.oauth_token) { self.authData.token = resp.oauth_token };
          if (resp.oauth_token_secret) { self.authData.tokenSecret = resp.oauth_token_secret };
          callback();
        }
      );
    },
    
    storage: {
      _loginHostname: "chrome://imgurfox",
      _loginRealm: "Imgur Access Token",
    
      load: function() {
        let logins = passwordManager.findLogins({}, this._loginHostname, null, this._loginRealm);
        return logins[0];
      },
      
      save: function(authData) {
        this.clear();
        let loginInfo = new nsLoginInfo(this._loginHostname, null, this._loginRealm,
                                        authData.token, authData.tokenSecret, "", "");
        passwordManager.addLogin(loginInfo);
      },
      
      clear: function() {
        let loginInfo = this.load();
        if (loginInfo) {
          passwordManager.removeLogin(loginInfo);
        }
      }
    }
  },
  
  _url: function(msg) {
    return msg.action + "?" + OAuth.formEncode(msg.parameters);
  },
  
  _request: function(msg, callback) {
    let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(),
        target;
        
    if (msg.method == "GET") {
      req.open(msg.method, this._url(msg), true);
    } else if (msg.method == "POST") {
      req.open(msg.method, msg.action, true);
      req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    }
    
    req.onreadystatechange = function (e) {
      if (req.readyState == 4) {
        if (req.status == 200) {
          callback(req);
        } else {
          // FIXME
        }
      }
    };
    req.send(msg.method == "GET" ? null : OAuth.formEncode(msg.parameters));
  }
};
