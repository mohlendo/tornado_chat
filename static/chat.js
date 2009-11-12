// Copyright 2009 FriendFeed
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may
// not use this file except in compliance with the License. You may obtain
// a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

$(document).ready(function() {
    if (!window.console) window.console = {};
    if (!window.console.log) window.console.log = function() {};
    $("#entry").keypress(function (e) {
      if (e.keyCode != 13 /* Return */) {
        return;
      }
      var msg = $("#entry").attr("value").replace("\n", "");
      var nxt = $("#next").attr("value");
      if (!util.isBlank(msg)) {
        newMessage(msg, nxt);
      }
      $("#entry").attr("value", ""); // clear the entry field.
    });
    //update the clock every second
    setInterval(function () {
      var now = new Date();
      $("#currentTime").text(util.timeString(now));
    }, 1000);
    
    scrollDown();
    updater.poll();
});


function newMessage(msg, nxt) {
  var message = {message: msg, next: nxt}; 
  $.postJSON("/a/message/new", message, function(response) {
      updater.showMessage(response);
  });
}

function getCookie(name) {
    var r = document.cookie.match("\\b" + name + "=([^;]*)\\b");
    return r ? r[1] : undefined;
}

jQuery.postJSON = function(url, args, callback) {
    args._xsrf = getCookie("_xsrf");
    $.ajax({url: url, data: $.param(args), dataType: "text", type: "POST",
	    success: function(response) {
	if (callback) callback(eval("(" + response + ")"));
    }, error: function(response) {
	console.log("ERROR:", response)
    }});
};

jQuery.fn.formToDict = function() {
    var fields = this.serializeArray();
    var json = {}
    for (var i = 0; i < fields.length; i++) {
	json[fields[i].name] = fields[i].value;
    }
    if (json.next) delete json.next;
    return json;
};

jQuery.fn.disable = function() {
    this.enable(false);
    return this;
};

jQuery.fn.enable = function(opt_enable) {
    if (arguments.length && !opt_enable) {
        this.attr("disabled", "disabled");
    } else {
        this.removeAttr("disabled");
    }
    return this;
};

var updater = {
    errorSleepTime: 500,
    cursor: null,

    poll: function() {
	var args = {"_xsrf": getCookie("_xsrf")};
	if (updater.cursor) args.cursor = updater.cursor;
	$.ajax({url: "/a/message/updates", type: "POST", dataType: "text",
		data: $.param(args), success: updater.onSuccess,
		error: updater.onError});
    },

    onSuccess: function(response) {
	try {
	    updater.newMessages(eval("(" + response + ")"));
	} catch (e) {
	    updater.onError();
	    return;
	}
	updater.errorSleepTime = 500;
	window.setTimeout(updater.poll, 0);
    },

    onError: function(response) {
	updater.errorSleepTime *= 2;
	console.log("Poll error; sleeping for", updater.errorSleepTime, "ms");
	window.setTimeout(updater.poll, updater.errorSleepTime);
    },

    newMessages: function(response) {
	if (!response.messages) return;
	updater.cursor = response.cursor;
	var messages = response.messages;
	updater.cursor = messages[messages.length - 1].id;
	console.log(messages.length, "new messages, cursor:", updater.cursor);
	for (var i = 0; i < messages.length; i++) {
	    updater.showMessage(messages[i]);
	}
    },

    showMessage: function(message) {
	var existing = $("#m" + message.id);
	if (existing.length > 0) return;
	var node = $(message.html);
	//node.hide();
	$("#log").append(node);
	//node.slideDown();
  scrollDown();
    }
};

// utility functions

util = {
urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

        //  html sanitizer 
        toStaticHTML: function(inputHtml) {
          return inputHtml.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        }, 

zeroPad: function (digits, n) {
           n = n.toString();
           while (n.length < digits) 
             n = '0' + n;
           return n;
         },

timeString: function (date) {
              var minutes = date.getMinutes().toString();
              var hours = date.getHours().toString();
              return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
            },

isBlank: function(text) {
           var blank = /^\s*$/;
           return (text.match(blank) !== null);
         }
};

function scrollDown () {
  window.scrollBy(0, 100000000000000000);
  $("#entry").focus();
}


