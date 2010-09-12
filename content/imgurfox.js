var ImgurFoxWindow = (function() {
  Components.utils.import("resource://imgurfox/oauth.jsm");

  let preferences = 
    Components
      .classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch("extensions.imgurfox@imgur.com.");
  
  let stringBundle = 
    Components
      .classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://imgurfox/locale/imgurfox.properties");
  
  let nativeJSON = 
    Components
      .classes["@mozilla.org/dom/json;1"]
      .createInstance(Components.interfaces.nsIJSON);
  
  let passwordManager = 
    Components
      .classes["@mozilla.org/login-manager;1"]
      .getService(Components.interfaces.nsILoginManager);
              
  let nsLoginInfo =
    new Components.Constructor("@mozilla.org/login-manager/loginInfo;1",
                               Components.interfaces.nsILoginInfo, "init");
  
  let imageFileReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  let CONTEXT_CHOICE = 0;
  let CONTEXT_UPLOAD = 1;
  let CONTEXT_EDIT   = 2;

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
      window.addEventListener("unload", ImgurFoxWindow.onUnload, false);
    },
    
    onLoad: function() {
      let contextMenu = document.getElementById("contentAreaContextMenu");
      contextMenu.addEventListener("popupshowing", function(event) {
          let imageURI = ImgurFoxWindow.contextImageURI,
              showMenuItem = imageURI && imageURI.scheme == "http";
              imageMenuItems = document.getElementsByClassName("imgur-image-command");
        
        Array.prototype.forEach.call(imageMenuItems, function(menuitem) {
          menuitem.hidden = !showMenuItem;
        });
      }, false)
      
      Imgur.oauth.load();
    },
    
    onUnload: function() {
      // :(
    },
    
    /* User command handlers */
    
    get contextImageURI() {
      if (gContextMenu.onImage) {
        // Right clicked on an image
        return gContextMenu.target.currentURI;
      } else if (gContextMenu.onLink && imageFileReg.test(gContextMenu.linkURL)) {
        // Right clicked on a link to an image
        return gContextMenu.linkURI;
      }
      return false;
    },
    
    uploadImage: function(event, edit) {
      Imgur.transload(ImgurFoxWindow.contextImageURI.spec, edit);
    },
    
    uploadScreenshot: function(event) {
      Imgur.upload(utils.dataFromURI(this.grabScreenshot()));
    },
    
    uploadSelectiveScreenshot: function(event) {
      this.grabSelectiveScreenshot(function(screenshotData) {
        Imgur.upload(utils.dataFromURI(screenshotData));
      });
    },
    
    /* Browser screenshot helpers */
    
    grabScreenshot: function(rect, fullPage) {
      let canvas = document.getElementById("imgurfox-canvas");
      let win = gBrowser.contentWindow;
      
      if (!rect) {
        rect = {};
        if (fullPage) {
          rect.x = 0;
          rect.y = 0;
          rect.w = win.document.documentElement.clientWidth;
          rect.h = win.document.documentElement.scrollHeight;
        } else {
          rect.x = win.scrollX;
          rect.y = win.scrollY;
          rect.w = win.innerWidth;
          rect.h = win.innerHeight;
        }
      }
      
      canvas.width = rect.w;
      canvas.height = rect.h;
      
      let ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, rect.w, rect.h);
      ctx.drawWindow(win, rect.x, rect.y, rect.w, rect.h, "rgb(255,255,255)");
      return canvas.toDataURL();
    },
    
    grabSelectiveScreenshot: function(callback) {
      var notificationValue = "imgurfox-selective-screenshot";
    
      function initBar(iframe) {
        let notificationBox = gBrowser.getNotificationBox();
        return notificationBox.appendNotification(
          stringBundle.GetStringFromName("selectiveScreenshot.message"),
          notificationValue, 
          "chrome://imgurfox/skin/upload_small.png",
          notificationBox.PRIORITY_INFO_HIGH,
          [{label:"Cancel", accessKey:"C", callback:function() { endCrop(iframe); }},
           {label:"Upload", accessKey:"U", callback:function() { performCrop(iframe); }}]);
      }
    
      function initCrop() {
        // Make an iframe on top of the page content.
        let pageDocument = gBrowser.contentDocument,
            pageDocumentHeight = pageDocument.documentElement.scrollHeight,
            overlayId = "_imgurfox-crop-overlay";
        
        if (pageDocument.getElementById(overlayId)) {
          // Already cropping the page.
          return;
        }
        
        let iframe = pageDocument.createElement("iframe");
        iframe.setAttribute("id", overlayId);
        iframe.setAttribute("style", "position:absolute; top:0; left:0; width:100%; height:"+pageDocumentHeight+"px; border:none; background:none; overflow:hidden; z-index:999999;");
        pageDocument.body.appendChild(iframe);
        
        // Woot, let"s start piling scripts and css into it.
        iframe.addEventListener("load", function(event) {
          let iframeDocument = iframe.contentDocument;
          iframeDocument.body.setAttribute("style", "margin:0; width:100%; height:100%;");
          
          utils.addCSS(iframeDocument, "chrome://imgurfox-crop/content/jquery.Jcrop.css");
          utils.addScripts(iframeDocument,
            ["chrome://imgurfox-crop/content/jquery-1.4.2.min.js",
             "chrome://imgurfox-crop/content/jquery.Jcrop.js"],
            function afterLoaded() {
              // Run this code within the iframe.
              iframe.contentWindow.location.href = "javascript:(" + function() {
                var dde = window.top.document.documentElement,
                    crop;
                
                function finishCrop() {
                  var event = document.createEvent("Events");
                  event.initEvent("CropFinished", true, false);
                  document.body.dispatchEvent(event);
                }
                
                function cancelCrop() {
                  crop.cancel();
                  crop.release();
                  finishCrop();
                }
                    
                window.getCoords = function() {
                  var coords = crop.tellSelect();
                  return JSON.stringify(coords);
                }
                
                $(window).keydown(function(e) {
                  // ESC Key
                  if (e.which == 27) {
                    cancelCrop(true);
                  }
                })
                
                crop = $.Jcrop(document.body, {
                  allowSelect: false,
                  boundary: 0,
                  onDblClick: finishCrop
                });
                    
                $(".jcrop-holder").hide();
                
                crop.setSelect([
                  dde.scrollLeft + 50,
                  dde.scrollTop + 50,
                  dde.scrollLeft + dde.clientWidth - 50,
                  dde.scrollTop + dde.clientHeight - 50]);
                  
                crop.focus();
                crop.enable();
                $(".jcrop-holder").fadeIn();
                return;
              } + ")();";
            }
          );
        }, false);
        
        return iframe;
      }
      
      function endCrop(iframe) {
        iframe.parentNode.removeChild(iframe);
        
        var notification = gBrowser.getNotificationBox().getNotificationWithValue(notificationValue);
        if (notification) { notification.close(); }
      }
      
      function performCrop(iframe) {
        let cropCoords = nativeJSON.decode(iframe.contentWindow.wrappedJSObject.getCoords());
        endCrop(iframe);
        if (cropCoords) {
          let screenshotData = ImgurFoxWindow.grabScreenshot(cropCoords);
          callback(screenshotData);
        }
      }
      
      let iframe = initCrop();
      if (iframe) {
        iframe.contentWindow.addEventListener("CropFinished", function() { performCrop(iframe) }, false);
        initBar(iframe).addEventListener("click", function(event) {
          if (/messageCloseButton/.test(event.originalTarget.getAttribute("class"))) {
            endCrop(iframe);
          }
        }, false);
      }
    },
  }
  
  var Imgur = {
    apiKey: "24bf6070f45ed716e8cf9324baebddbd",
    
    transload: function(src, edit) {
      let msg = {
        method: "GET",
        action: "http://api.imgur.com/2/upload",
        parameters: {
          url: src,
        }
      };
      
      if (edit) { msg.parameters.edit = edit; }
      if (this.oauth.isAuthenticated) {
        this.oauth.authenticateMsg(msg);
      } else {
        msg.parameters.key = this.apiKey;
      }
      gBrowser.selectedTab = gBrowser.addTab(this._url(msg));
    },
  
    upload: function(base64data) {
      let msg = {
        method: "POST",
        action: "http://api.imgur.com/2/upload",
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
      
      let imageTab = gBrowser.selectedTab = gBrowser.addTab("http://imgur.com/working/");      
      Imgur._request(
        msg,
        function(req) {
          data = nativeJSON.decode(req.responseText);
          gBrowser.getBrowserForTab(imageTab).loadURI((data.upload || data.images).links.imgur_page);
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
      
      authorize: function(statusCallback) {
        function requestToken(callback) {
          Imgur.oauth.authData = this._newAuthData();
          Imgur.oauth._tokenRequest("https://api.imgur.com/oauth/request_token", callback);
        }
        
        function authorizeWithUser(callback) {
          // Using that request token, open the authorize page and wait for user feedback.
          let target = Imgur._url(Imgur.oauth.authenticateMsg({action: "http://api.imgur.com/oauth/authorize"})),
              authorizeTab = gBrowser.selectedTab = gBrowser.addTab(target),
              authorizeBrowser = gBrowser.getBrowserForTab(authorizeTab);
          
          gBrowser.getBrowserForTab(authorizeTab).addEventListener("load", function() {
            let doc = authorizeBrowser.contentDocument,
                heading = doc.getElementsByTagName("h1")[0],
                allow = null;
            
            if (/\bdenied\b/.test(heading)) {
              allow = false;
            } else if (/\ballowed\b/.test(heading) || heading.textContent == "Success!") {
              allow = true;
            }
            
            if (allow != null) {
              gBrowser.getBrowserForTab(authorizeTab).removeEventListener("load", arguments.callee, true);
              callback(allow);
            }
          }, true);
        }
        
        function accessToken(callback) {
          Imgur.oauth._tokenRequest("https://api.imgur.com/oauth/access_token", callback);
        }
        
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
  
  var utils = {
    setAttributes: function(el, attrs) { 
      attrs.forEach(function(attr) {
        el.setAttribute(attr[0], attr[1]);
      });
    },
    
    addScript: function(doc, src, callback) { 
      let el = doc.createElement("script");
      this.setAttributes(el, [["type", "text/javascript"], ["src", src]]);
      if (callback) { el.addEventListener("load", callback, false); }
      doc.getElementsByTagName("head")[0].appendChild(el);
      return el;
    },
    
    addScripts: function(doc, scripts, callback) {
      if (scripts.length > 0) {
        this.addScript(doc, scripts.shift(), function() {
          utils.addScripts(doc, scripts, callback);
        });
      } else {
        if (callback) { callback(); }
      }
    },
    
    addCSS: function(doc, src) {
      let el = doc.createElement("link");
      this.setAttributes(el, [["type", "text/css"], ["rel", "stylesheet"], ["href", src]]);
      doc.getElementsByTagName("head")[0].appendChild(el);
      return el;
    },
    
    dataFromURI: function(dataURI) {
      return dataURI.replace(/^([^,])*,/, "");
    }
  };
  
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
