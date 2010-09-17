var EXPORTED_SYMBOLS = ["ShareTo"];

var enc = encodeURIComponent;

var ShareTo = {
  reddit:      function(url) "http://reddit.com/submit?url="+enc(url),
  digg:        function(url) "http://digg.com/submit?url="+enc(url),
  twitter:     function(url) "http://twitter.com/share?url="+enc(url),
  facebook:    function(url) "http://www.facebook.com/sharer.php?u="+enc(url),
  stumbleupon: function(url) "http://stumbleupon.com/submit?url="+url, // StumbleUpon doesn't like it when we encode the URL.
  buzz:        function(url) "http://www.google.com/buzz/post?url="+enc(url)
};
