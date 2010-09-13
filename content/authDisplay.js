var ImgurFoxAuthDisplay = (function() {
  Components.utils.import("resource://imgurfox/imgur.jsm");
  
  var ImgurFoxAuthDisplay = {
    init: function() {
      window.addEventListener("load", ImgurFoxAuthDisplay.onLoad, false);
    },
    
    onLoad: function() {
      ImgurFoxAuthDisplay.updateStatus();
    },
    
    setLoading: function(isLoading) {
      document.getElementById("loading-indicator").style.display = isLoading ? "inline" : "none";
    },
    
    updateStatus: function() {
      let contentEl = document.getElementById("content"),
          accountLabelEl = document.getElementById("account-label"),
          accountNameEl = document.getElementById("account-name");
      if (Imgur.oauth.isAuthenticated) {
        ImgurFoxAuthDisplay.setLoading(true);
        Imgur.accountInfo(function(info) {
          contentEl.className = "signed-in";
          ImgurFoxAuthDisplay.setLoading(false);
          accountLabelEl.textContent = "Signed in as:";
          accountNameEl.textContent = info.account.url;
          accountNameEl.className = info.account.is_pro ? "pro" : "";
        });
      } else {
        contentEl.className = "signed-out";
        ImgurFoxAuthDisplay.setLoading(false);
        accountLabelEl.textContent = "You are currently signed out.";
        accountNameEl.textContent = "";
        accountNameEl.className = "";
      }
    },
    
    signin: function() {
      ImgurFoxAuthDisplay.setLoading(true);
      Imgur.oauth.authorize(function(status) {
        document.getElementById("account-label").textContent = {
          request: "Connecting...",
          authorize: "Waiting for authorization...",
          allowed: "Recieved authorization...",
          denied: "Access denied.",
          access: "Finalizing...",
          success: ""
        }[status];
        
        if (status == "success") {
          ImgurFoxAuthDisplay.updateStatus();
        }
      });
    },
    
    logout: function() {
      Imgur.oauth.forget();
      ImgurFoxAuthDisplay.updateStatus();
    },
    
    register: function() {
      Imgur.register();
    }
  };
  
  return ImgurFoxAuthDisplay;
})();

ImgurFoxAuthDisplay.init();
