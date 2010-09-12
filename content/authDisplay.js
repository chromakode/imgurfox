var ImgurFoxAuthDisplay = (function() {
  Components.utils.import("resource://imgurfox/imgur.jsm");
  
  var ImgurFoxAuthDisplay = {
    init: function() {
      window.addEventListener("load", ImgurFoxAuthDisplay.onLoad, false);
    },
    
    onLoad: function() {
      document.getElementById("imgur-auth-logout").addEventListener("click", function() {
        Imgur.oauth.forget();
      }, false);
      
      document.getElementById("imgur-auth-login").addEventListener("click", function() {
        Imgur.oauth.authorize(function(status) {
          document.getElementById("imgur-auth-login").label = status;
        });
      }, false);
    },
  };
  
  return ImgurFoxAuthDisplay;
})();

ImgurFoxAuthDisplay.init();
