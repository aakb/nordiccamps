(function ($) {
  /**
  * This function slides in the next page in the menu. If the page is more than
  * one away it will slide faster. It loads content via ajax and saves a local
  * copy to not ask the server more than once for content.
  *
  * It assumes that the target for the animation is the ul with a tags inside
  * li's.
  *
  * Pattern: Revealing module
  *
  * Functions:
  *   init - Init the object and takes an object litteral with menu
  *          (css selector), content (css selector), speed (page transition
  *          speed).
  *   start - Activate the animations (mostly for development).
  *   stop - End the animation (mostly for development).
  */
  var slider = (function() {
    var $menu;
    var $content;
    var $outer;
    var isAnimationRunning = false;
    var cache = {};
    var fragment;

    var options = {
      menu: '.region-menu ul',
      content: '#zone-content-wrapper', // Slider container.
      outer: '#section-content', // Overflow container.
      fadeSpeed: 600,
      slideSpeed: 800
    };

    // Init the object and get options.
    function init(opt) {
      // @TODO: loop over options an ensure that only the one parsed is overridden.
      if (opt !== undefined) {
        options = opt;
      }

      // Preload the background images.
      backgroundPreload();

      // Extract background image.
      $content = $(options.content);
      var bgImage = $content.css('backgroundImage').replace(/url\((.+)\)/, "$1").replace(/"/g, "");

      // Build wrapper content.
      $outer = $(options.outer);
      $outer.css({'overflow-x':'hidden'});
      $outer.css('background-image', 'url(\'' + bgImage + '\')');
      $content.css({'width': '200%', 'position': 'absolute'});

      // Wrap inner in slide div.
      $content.wrapInner('<div class="slide current" style="width: 50%"></div>');

      // Create fragment that can be used to build slids.
      //$fragment = $content.clone();

      // jquery .clone() is not working in IE8 so we use node.cloneNode() instead.
      // Then the DOM object is transformed into a jQuery object to do a little cleanup.
      // Afterwards the jQuery object is turned back into a DOM object.
      var temp = document.getElementById("zone-content-wrapper").cloneNode(true);
      var $localFragment = $(temp);
      $('#region-content .content', $localFragment).html('');
      $('#region-sidebar .region-inner', $localFragment).html('');
      $('.slide', $localFragment).removeClass('current');
      //fetch the jquery object and transform into regular dom object
      fragment = $localFragment[0];

      // Remove old background.
      $content.css('backgroundImage', 'none');

      // Get menu as jquery object.
      $menu = $(options.menu);

      // Get target.
      $content = $(options.content);

      // Add navigation items.
      $menu.prepend('<li><span class="arrow-nav prev"><a href="#previous">'+Drupal.t('Back')+'</a></span></li>');
      $menu.append('<li><span class="arrow-nav next"><a href="#next">'+Drupal.t('Forward')+'</a></span></li>');

      fixVideos();
      //Fix IE height now
      heightFix();
    }

    // Preload all background images to make transitions smoother.
    function backgroundPreload() {
      $.get('/node2json/preload', function(data) {
        $(data).each(function() {
          $('<img/>')[0].src = this;
         });
      });
    }

    // Start the application.
    function start() {
      // Load page if hash-tag is defined.
      var hash = getHashtag();
      if (hash != '') {
        var url = '/' + (hash == 'frontpage' ? '' : hash);
        if (!(url == '/' && $('body').hasClass('front'))) {
          var link = $('a[href="' + url + '"]', $menu);
          fetchPage(url, link, 'fade');
        }
      }

      // Attache event listners to the target list.
      $menu.delegate('.leaf a', 'click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (isAnimationRunning) {return;}
        isAnimationRunning = true;
        var link = $(event.target);
        fetchPage(link.attr('href'), link, 'fade');
      });

      // Add listerns to navigation arrows.
      $menu.delegate('.arrow-nav', 'click', function(event) {
        event.stopPropagation();
        event.preventDefault();
        if (isAnimationRunning) {return;}
        isAnimationRunning = true;
        var link = $(event.target);
        if (link.attr('href') == '#previous') {
          prev();
        }
        else {
          next();
        }
      });
    }

    // Used to store page content.
    function saveData(raw, key) {
      var data = {
          'page_title':raw.page_title,
          'content':(raw.field_title_image == undefined ? '' : raw.field_title_image + "\n") + raw.field_body,
          'sidebar':raw.field_video_custom,
          'background':(raw.image ? raw.image : '/misc/druplicon.png'),
          'translations':raw.translations,
          'language':raw.language
      };
      cache[key] = data;
      return data;
    }

    // Return stored data based on key.
    function loadData(key) {
      if (cache[key] !== undefined) {
        return cache[key];
      }
      return null;
    }

    // Ajax call to get page content.
    function fetchPage(url, link, direction) {
      var path = url == '/' ? '/home' : url;

      // Try to get content from cache.
      var key = getHashKey(path);
      var content = loadData(key);
      if (content !== null) {
        // Found content in cache.
        animatePageLoad(content, link, direction);
      }
      else {
        // The ajax query string is used to change theme in the backend.
        $.post('/node2json', {node2json_path: path}, function(data) {
          data = saveData(data, key);
          animatePageLoad(data, link, direction);
        });
      }
      addHashtag(key);
    }

    // Build hash key based on url, if non provied current path will be used.
    function getHashKey(url) {
      var hash = '';
      if (url === undefined) {
        url = window.location.pathname == '/' ? '/home' : window.location.pathname;
        hash = url.substr(1);
      }
      else {
        if (url.charAt(0) == '/') {
          hash = url.substr(1);
          if (hash == '') {
            hash = 'home';
          }
        }
        else {
          hash = url;
        }
      }
      return hash;
    }

    // Add hash tag to url.
    function addHashtag(hash) {
      window.location.hash = hash;
    }

    // Get hash tag from url.
    function getHashtag() {
      return window.location.hash.substr(1);
    }

    // Update active class in the menu.
    function updateActiveMenu(link) {
      $('a', $menu).removeClass('active active-trail');
      $('li', $menu).removeClass('active active-trail');
      link.addClass('active active-trail');
      link.parent().parent().addClass('active active-trail');
    }

    // Build slide div.
    function buildSlide(data, slide_class) {
      var temp = fragment.cloneNode(true);
      var slide = $(temp);

      // Fix flicker in background image.
      $('.slide', slide).width($outer.width() + 'px');

      $('#region-content .content', slide).html(data.content);
      $('#region-sidebar .region-inner', slide).html(data.sidebar);
      $('#page-title', slide).html(data.page_title);
      $('.slide', slide).removeClass(slide_class).css('backgroundImage', 'url(\'' + data.background + '\')');
      return $('.slide', slide);
    }

    // Re-initialize fitVids on slide.
    function fixVideos() {
      $(".field-name-field-video-custom").fitVids({customSelector: "iframe[src^='']"});
      // triggering the below in IE break the video display
      if(!$.browser.msie) {
        $(".inline-video").fitVids({customSelector: "iframe[src^='']"});
      }
    }

    // Update languge switch url.
    function updateLanguageSwitch(translations) {
      var url;
      var lang_switch = $('.language-switcher-locale-url li');
      if (translations != null) {
        var url, lang = null;
        if (lang_switch.hasClass('en')) {
          lang = 'english';
          url = '/en/node/' + translations.en.nid;
        }
        else {
          lang = 'dansk';
          url = '/node/' + translations.da.nid;
        }
        lang_switch.html('<a class="language-link" href="' + url + '">' + lang + '</a>');
      }
      else {
        var lang = $('a', lang_switch).text();
        lang_switch.html('<span class="locale-untranslated">' + lang + '</span>');
      }
    }

    // Animate the page load (slide/fade).
    function animatePageLoad(data, link, direction) {
      var currentPage = $('.current', $content);

      // Fix content by wrapping in slide div.
      var slide = buildSlide(data, direction);

      if (direction == 'left') {
        // Move content wrapper ( <- ) to show current.
        currentPage.css('right', '0%');
        $content.prepend(slide.css('left', '0%'));
        fixVideos();
        updateLanguageSwitch(data.translations);
        $content.css('right', '0%').animate(
          {right:'-100%'},
          {
            duration: options.slideSpeed,
            easing: 'easeOutCubic',
            complete: function(){
              currentPage.remove();

              // Reset slider.
              $content.css('right', 'auto');
              slide.css('left', 'auto');
              slide.removeClass('left').addClass('current');

              // Move background to fix scroll
              slide.css('backgroundImage', 'none');
              $outer.css('backgroundImage', 'url(\'' + data.background + '\')');
              isAnimationRunning = false;

              //Fix IE height now
              heightFix();
            }
        });
      }
      else if (direction == 'right') {
        $content.css('right', '-100%');
        $content.append(slide.css('left', '50%'));
        fixVideos();
        updateLanguageSwitch(data.translations);
        $content.animate(
          {'right':'0%'},
          {
            duration: options.slideSpeed,
            easing: 'easeOutCubic',
            complete: function(){
              currentPage.remove();

              // Reset slider.
              $content.css('right', 'auto');
              slide.css('left', 'auto');
              slide.removeClass('right').addClass('current');

              // Move background to fix scroll
              slide.css('backgroundImage', 'none');
              $outer.css('backgroundImage', 'url(\'' + data.background + '\')');

              isAnimationRunning = false;

              //Fix IE height now
              heightFix();
            }
        });
      }
      else {
        // Remove current slide.
        currentPage.remove();

        // Hide slide, append and fade in the slide.
        slide.hide();
        $content.append(slide);
        fixVideos();
        updateLanguageSwitch(data.translations);
        slide.fadeIn(options.fadeSpeed, function() {
          // Work around when to faste menu clicks, which lead to 0.001232 opacity).
          slide.css('filter', 'alpha(opacity=100)');
          slide.css('opacity', '1');
          slide.removeClass('fade').addClass('current');

          // Move background to fix scroll
          slide.css('backgroundImage', 'none');
          $outer.css('backgroundImage', 'url(\'' + data.background + '\')');

          isAnimationRunning = false;

          //Fix IE height now
          heightFix();

        });
      }
      updateActiveMenu(link);
      addHashtag(getHashKey(link.attr('href')));
    }

    // Find the next element in the menu to load (used by next link).
    function next() {
      var current = $('a.active, a.active-trail', $menu);
      if (current.length == 1) {
        var link = current;
        var list = current.parent().parent();
        if (list.hasClass('last')) {
          link = $('.first a', list.parent());
        }
        else {
          link = $('a', list.next());
        }
        fetchPage(link.attr('href'), link, 'right');
      }
    }

    // Find the previous element in the menu to load (used by prev link).
    function prev() {
      var current = $('a.active, a.active-trail', $menu);
      if (current.length == 1) {
        var link = current;
        var list = current.parent().parent();
        if (list.hasClass('first')) {
          link = $('.last a', list.parent());
        }
        else {
          link = $('a', list.prev());
        }
        fetchPage(link.attr('href'), link, 'left');
      }
    }

    // IE height fix, force slider section-content container to have same height as region-content div
    function heightFix(){
        //only trigger when browser is IE
        if($.browser.msie) {
            // the region-content container is sometimes smaller than the entire html container,
            // check to see which height to use when resizing.
            //alert($('#region-content').height()+200);
            //alert($('html').height());
            if ($('#region-content').height()+200 > $('html').height()) {
                $('#section-content').height($('#region-content').height()+200);
            }
            else {
                $('#section-content').height($('html').height()-102); //subtract height of header
            }

        }
    }

    // Return public methods.
    return {
      init : init,
      start: start,
      fixVideos: fixVideos
    };
  }());

  // Add click event to dropdown menu classes
  function menuDropdown() {
    $('.menu-dropdown').click(function() {
      var menu = $(this).children('.menu');
      menu.css('display', (menu.css('display') == 'none' ? 'block' : 'none'));
    });
  }

  /**
   * Defines function().
   * Creates <select /> from menu block.
   */
  function menuToSelect(source) {

    // Make sure there is a reason to create the menu.
    if ($(source).find("ul").length) {
      // Create wrapper for mobile menu.
      $("<div />", {
        "class" : "mobile-menu"
      }).prependTo(source);


      // Create the dropdown base
      $("<select />", {
      }).appendTo(".mobile-menu", $(source));

      // Create default option "Go to..."
      $("<option />", {
         "selected": "selected",
         "value"   : "",
         "text"    : Drupal.t('Menu')
      }).appendTo($("select", source));

      // Populate dropdown with menu items
      $(source).each(function() {
        var el = $(this);

        children    = el.find("li");

        $("<option />", {
          "value" : el.find("> h2 > a").attr("href"),
          "text"  : el.find("> h2 > a").text()
        }).appendTo("select:last");

        children.find("a").each(function() {
          $("<option />", {
            "value" : $(this).attr("href"),
            "text" : " - " + $(this).text()
          }).appendTo("select:last");
        });

        // To make dropdown actually work
        $("select", source).change(function() {
          window.location = $(this).find("option:selected").val();
        });
      });
    }
  }

  // Load the module and start the fun.
  $(document).ready(function() {
    // Don't run code for logged in users, as it give problems with node edit
    // and messages from the system.
    if (!$('body').hasClass('logged-in')) {
      slider.init();
      slider.start();
    }

    slider.fixVideos();

    // Adds event to the dropdown menus
    menuDropdown();
    menuToSelect(".region-secondary-menu-inner");
  });
}) (jQuery);
