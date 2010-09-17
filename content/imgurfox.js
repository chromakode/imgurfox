var ImgurFoxWindow = (function() {
  Components.utils.import("resource://imgurfox/imgur.jsm");
  Components.utils.import("resource://imgurfox/shareto.jsm");
  Components.utils.import("resource://imgurfox/inject.jsm");

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
  
  let imageFileReg = /\.(jpg|jpeg|gif|png|apng|tiff|bmp|pdf|xcf)(\?.*)?$/i;
  
  let CONTEXT_CHOICE = 0;
  let CONTEXT_UPLOAD = 1;
  let CONTEXT_EDIT   = 2;
  
  function dataFromURI(dataURI) {
    return dataURI.replace(/^([^,])*,/, "");
  }

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
      window.addEventListener("unload", ImgurFoxWindow.onUnload, false);
    },
    
    onLoad: function() {
      let contextMenu = document.getElementById("contentAreaContextMenu"),
          imgurMenu = document.getElementById("context-imgur");
      contextMenu.addEventListener("popupshowing", function(event) {
        if (gContextMenu.onLink || !gContextMenu.onTextInput && !gContextMenu.isContentSelected) {
          let imageURI = ImgurFoxWindow.contextImageURI,
              showMenuItem = imageURI && imageURI.scheme == "http";
              imageMenuItems = document.getElementsByClassName("imgur-image-command");
          
          Array.prototype.forEach.call(imageMenuItems, function(menuitem) {
            menuitem.hidden = !showMenuItem;
          });
          imgurMenu.hidden = false || (gContextMenu.onLink && !imageURI);
        } else {
          imgurMenu.hidden = true;
        }
      }, false)
      
      Imgur.oauth.load();
      ImgurFoxWindow.checkFirstRun();
    },
    
    onUnload: function() {
      // :(
    },
    
    checkFirstRun: function() {
      let firstRun = true;
      if (preferences.prefHasUserValue("firstRun")) {
        firstRun = false;
      }
      
      if (firstRun) {
        setTimeout(function() {
          gBrowser.selectedTab = gBrowser.addTab("chrome://imgurfox/content/welcome.html");
        }, 0);
        preferences.setBoolPref("firstRun", false);
      }
    },
    
    /* User command handlers */
    
    get contextImageURI() {
      if (gContextMenu.onImage) {
        // Right clicked on an image
        return gContextMenu.target.currentURI;
      } else if (gContextMenu.hasBGImage) {
        return makeURI(gContextMenu.bgImageURL);
      } else if (gContextMenu.onLink && imageFileReg.test(gContextMenu.linkURL)) {
        // Right clicked on a link to an image
        return gContextMenu.linkURI;
      } else {
        return false;
      }
    },
    
    _createWorkingTab: function(callback) {
      let workingTab = gBrowser.selectedTab = gBrowser.addTab("http://imgur.com/working/");
          workingBrowser = gBrowser.getBrowserForTab(workingTab);
          
      // While waiting for the working indicator page to load completely seems wrong,
      // we must do this since taking the screenshot will hard freeze the browser. We have to
      // give the browser a chance to load and render the working page, or else the user will
      // be left staring at a blank screen.
      workingBrowser.addEventListener("load", function() {
        workingBrowser.removeEventListener("load", arguments.callee, true);
        setTimeout(function() {
          callback({
            go: function(url) {
              let browser = gBrowser.getBrowserForTab(workingTab);
              if (browser.loadURI) { browser.loadURI(url); }
            },
            close: function() {
              gBrowser.removeTab(workingTab);
            }
          });
        }, 0);
      }, true);
    },
    
    _uploadScreenshot: function(takeScreenshot) {
      ImgurFoxWindow._createWorkingTab(function(workingTab) {
        Imgur.upload(dataFromURI(takeScreenshot()), function(imageInfo) {
          workingTab.go(imageInfo.links.imgur_page);
        });
      });
    },
    
    uploadImage: function(event, edit, share) {
      let src = ImgurFoxWindow.contextImageURI.spec;
      ImgurFoxWindow._createWorkingTab(function(workingTab) {
        Imgur.transload(src, edit, function(url) {
          workingTab.go(share ? ShareTo[share](url) : url);
        });
      });
    },
    
    uploadScreenshot: function(event) {
      let win = gBrowser.contentWindow;
      ImgurFoxWindow._uploadScreenshot(function() ImgurFoxWindow.grabScreenshot(win));
    },
    
    uploadSelectiveScreenshot: function(event) {
      ImgurFoxWindow.grabSelectiveScreenshot(ImgurFoxWindow._uploadScreenshot);
    },
    
    /* Browser screenshot helpers */
    
    grabScreenshot: function(win, rect) {
      let canvas = document.getElementById("imgurfox-canvas");
      
      if (!rect) {
        rect = {x: win.scrollX, y: win.scrollY, w: win.document.body.clientWidth, h: win.document.body.clientHeight};
      }
      
      canvas.width = rect.w;
      canvas.height = rect.h;
      
      let ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, rect.w, rect.h);
      ctx.drawWindow(win, rect.x, rect.y, rect.w, rect.h, "rgb(255,255,255)");
      return canvas.toDataURL();
    },
    
    grabSelectiveScreenshot: function(callback) {
      let notificationValue = "imgurfox-selective-screenshot",
          pageWindow = gBrowser.contentWindow,
          pageDocument = gBrowser.contentDocument;
    
      function initBar(iframe) {
        let notificationBox = gBrowser.getNotificationBox();
        return notificationBox.appendNotification(
          stringBundle.GetStringFromName("selectiveScreenshot.message"),
          notificationValue, 
          "chrome://imgurfox/skin/imgur_small.png",
          notificationBox.PRIORITY_INFO_HIGH,
          [{label:"Cancel", accessKey:"C", callback:function() { endCrop(iframe); }},
           {label:"Upload", accessKey:"U", callback:function() { performCrop(iframe); }}]);
      }
    
      function initCrop() {
        // Make an iframe on top of the page content.
        let pageDocumentHeight = pageDocument.documentElement.scrollHeight,
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
          
          Inject.css(iframeDocument, "chrome://imgurfox-crop/content/jquery.Jcrop.css");
          Inject.scripts(iframeDocument,
            ["chrome://imgurfox-crop/content/jquery-1.4.2.min.js",
             "chrome://imgurfox-crop/content/jquery.Jcrop.js"],
            function afterLoaded() {
              // Run this code within the iframe.
              iframe.contentWindow.location.href = "javascript:(" + function() {
                var parentdoc = window.top.document,
                    dde = parentdoc.documentElement,
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
                  dde.scrollLeft + parentdoc.body.clientWidth - 50,
                  dde.scrollTop + parentdoc.body.clientHeight - 50]);
                  
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
          callback(function() ImgurFoxWindow.grabScreenshot(pageWindow, cropCoords));
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
  
  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
