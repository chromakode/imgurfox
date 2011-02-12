var ImgurFoxWindow = (function() {
  Components.utils.import("resource://imgurfox/imgur.jsm");
  Components.utils.import("resource://imgurfox/shareto.jsm");
  Components.utils.import("resource://imgurfox/inject.jsm");

  let preferences =
    Components
      .classes["@mozilla.org/preferences-service;1"]
      .getService(Components.interfaces.nsIPrefService)
      .getBranch("extensions.giorgio@gilestro.tk.");
  
  let stringBundle =
    Components
      .classes["@mozilla.org/intl/stringbundle;1"]
      .getService(Components.interfaces.nsIStringBundleService)
      .createBundle("chrome://imgurfox/locale/imgurfox.properties");
  
  let nativeJSON =
    Components
      .classes["@mozilla.org/dom/json;1"]
      .createInstance(Components.interfaces.nsIJSON);

  let ioService =
    Components
      .classes["@mozilla.org/network/io-service;1"]
      .getService(Components.interfaces.nsIIOService);
  
  let imageMimes = "jpg|gif|png|tiff|bmp",
      imageFileReg = new RegExp("\\.("+imageMimes+"|jpeg|apng|pdf|xcf)(\\?.*)?$", "i");
  
  let CONTEXT_CHOICE = 0;
  let CONTEXT_UPLOAD = 1;
  let CONTEXT_EDIT   = 2;
  
  function dataFromURI(dataURI) {
    return dataURI.replace(/^([^,])*,/, "");
  }

  var ImgurFoxWindow = {
    init: function() {
      window.addEventListener("load", ImgurFoxWindow.onLoad, false);
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
      }, false);

      imgurMenu.addEventListener("popupshowing", function(event) {
        setTimeout(function() {
          // This can be slow for huge images, but it seems like the best UI presentation.
          ImgurFoxWindow._clipboardImageData = ImgurFoxWindow.getClipboardImageData();
          let clipboardMenuItem = document.getElementById("context-imgur-from-clipboard");
          clipboardMenuItem.disabled = !ImgurFoxWindow._clipboardImageData;
        }, 0);
      }, false);
      
      Imgur.oauth.load();
      ImgurFoxWindow.checkFirstRun();
    },
    
    checkFirstRun: function() {
      if (!preferences.prefHasUserValue("firstrun")) {
        setTimeout(function() {
          gBrowser.selectedTab = gBrowser.addTab("chrome://imgurfox/content/welcome.html");
        }, 0);
        preferences.setBoolPref("firstrun", false);
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

    getClipboardImageData: function() {
      let clip = Components.classes["@mozilla.org/widget/clipboard;1"].getService(Components.interfaces.nsIClipboard),
          trans = Components.classes["@mozilla.org/widget/transferable;1"].createInstance(Components.interfaces.nsITransferable);

      imageMimes.split("|").forEach(function(mime) {
        trans.addDataFlavor("image/"+mime);
      });

      clip.getData(trans, clip.kGlobalClipboard);  
      
      let flavorContainer = {}, dataContainer = {}, dataLength = {};
      try {
        trans.getAnyTransferData(flavorContainer, dataContainer, dataLength);
      } catch(e) {
        return;
      }

      return "data:"+flavorContainer.value+";base64,"+btoa(dataContainer.value.data);
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
            get browser() {
              return gBrowser.getBrowserForTab(workingTab);
            },
            get notificationBox() {
              return gBrowser.getNotificationBox(this.browser);
            },
            go: function(url) {
              let browser = this.browser;
              if (browser.loadURI) { browser.loadURI(url, ioService.newURI("http://imgur.com/working/", null, null)); }
            },
            close: function() {
              gBrowser.removeTab(workingTab);
            }
          });
        }, 0);
      }, true);
    },
    
    _uploadImage: function(getImage) {
      ImgurFoxWindow._createWorkingTab(function(workingTab) {
        Imgur.upload(dataFromURI(getImage()),
          function success(imageInfo) { workingTab.go(imageInfo.links.imgur_page); },
          function error() { ImgurFoxWindow.errorMessage(workingTab.notificationBox); }
        );
      });
    },
    
    transloadImage: function(event, edit, share) {
      let src = ImgurFoxWindow.contextImageURI.spec;
      ImgurFoxWindow._createWorkingTab(function(workingTab) {
        Imgur.transload(src, edit,
          function success(url) { workingTab.go(share ? ShareTo[share](url) : url); },
          function error() { ImgurFoxWindow.errorMessage(); }
        );
      });
    },

    uploadClipboardImage: function(event) {
      let imageData = ImgurFoxWindow.getClipboardImageData();
      if (imageData) {
        ImgurFoxWindow._uploadImage(function() imageData);
      }
    },
    
    uploadScreenshot: function(event) {
      let win = gBrowser.contentWindow;
      ImgurFoxWindow._uploadImage(function() ImgurFoxWindow.grabScreenshot(win));
    },
    
    uploadSelectiveScreenshot: function(event) {
      ImgurFoxWindow.grabSelectiveScreenshot(ImgurFoxWindow._uploadImage);
    },
    
    /* Browser screenshot helpers */
    
    grabScreenshot: function(win, rect) {
      let canvas = document.getElementById("imgurfox-canvas");
      
      if (!rect) {
        rect = {x: win.pageXOffset, y: win.pageYOffset, w: win.innerWidth, h: win.innerHeight};
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
              iframe.contentWindow.location.href = "javascript:(" + function(startingRect) {
                var crop;
                
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
                crop.setSelect(startingRect);
                crop.focus();
                crop.enable();
                $(".jcrop-holder").fadeIn();
                return;
              } + ")(["+[
                pageWindow.pageXOffset + 50,
                pageWindow.pageYOffset + 50,
                pageWindow.pageXOffset + pageWindow.innerWidth - 50,
                pageWindow.pageYOffset + pageWindow.innerHeight - 50
              ]+"]);";
            }
          );
        }, false);


        // Sadly, it appears an iframe only gets mouse events while the pointer
        // is above the iframe element. We have to cheat by cloning mouse events
        // from the containing document in order to accurately move the crop rectangle
        // when the pointer moves outside the window.
        function cloneMouseEvent(e, eType, toWin) {
          eNew = toWin.document.createEvent('MouseEvents');
          eNew.initMouseEvent(
            eType, e.canBubble, e.cancelable, e.view,
            e.detail, e.screenX, e.screenY,
            // Note: we add the scroll offsets to the dom position here because the crop overlay frame
            // stretches the full size of the page, and thus does not scroll.
            e.clientX + e.view.pageXOffset, e.clientY + e.view.pageYOffset,
            e.ctrlKey, e.altKey, e.shiftKey, e.metaKey,
            e.button, e.relatedTarget);
          return eNew;
        }

        var proxiedEvents = ['mousemove', 'mouseup'];
        proxiedEvents.forEach(function(eName) {
          document.addEventListener(eName, function(e) {
            if (iframe.contentWindow) {
              iframe.contentDocument.dispatchEvent(cloneMouseEvent(e, 'ext'+e.type, iframe.contentWindow));
            } else {
              // Lazy cleanup; fires once after our iframe goes away.
              document.removeEventListener(eName, arguments.callee, false);
            };
          }, false);
        });

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

    /* Etc */
    errorMessage: function(notificationBox, message) {
      notificationBox = notificationBox || gBrowser.getNotificationBox();
      return notificationBox.appendNotification(
          message || stringBundle.GetStringFromName("imgurError.message"),
          "imgurfox-error",
          "chrome://imgurfox/skin/imgur_small.png",
          notificationBox.PRIORITY_WARNING_MEDIUM);
    }
  };

  return ImgurFoxWindow;
})();

ImgurFoxWindow.init();
