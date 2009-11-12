#!/usr/bin/env python
#
# Copyright 2009 Facebook
#
# Licensed under the Apache License, Version 2.0 (the "License"); you may
# not use this file except in compliance with the License. You may obtain
# a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
# WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
# License for the specific language governing permissions and limitations
# under the License.

import logging
import tornado.auth
import tornado.escape
import tornado.httpserver
import tornado.ioloop
import tornado.options
import tornado.web
import os.path
import uuid
import redis
import simplejson as json


from tornado.options import define, options

define("port", default=8001, help="run on the given port", type=int)


class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r"/", MainHandler),
            (r"/auth/login", AuthLoginHandler),
            (r"/auth/logout", AuthLogoutHandler),
            (r"/a/message/new", MessageNewHandler),
            (r"/a/message/updates", MessageUpdatesHandler),
        ]
        settings = dict(
            login_url="/auth/login",
            cookie_secret="32oETzKXQAGaYdkL5gEmGeJJFuYh7EQnp2XdTP1o/Vo=",
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
        )
        tornado.web.Application.__init__(self, handlers, **settings)


class BaseHandler(tornado.web.RequestHandler):
    def get_current_user(self):
        user = self.get_secure_cookie("user")
        if not user: return None
        return user


class MainHandler(BaseHandler):
    @tornado.web.authenticated
    def get(self):
        r = redis.Redis()
        r.select(6)
        messages = [json.loads(m) for m in r.lrange('room:1',0, -1)]
        self.render("index.html", messages=messages)


class MessageMixin(object):
    waiters = []

    def wait_for_messages(self, callback, cursor=None):
        cls = MessageMixin
        
        r = redis.Redis()
        r.select(6)

        if(not cursor):
          cursor = -1
        
        last_index = r.llen('room:1') - 1
        if(cursor <= last_index):
            messages = [json.loads(m) for m in r.lrange('room:1',0, cursor)]
            if messages:
                callback(messages)
                return
        cls.waiters.append(callback)


    def new_messages(self, messages):
        cls = MessageMixin
        logging.info("Sending new message to %r listeners", len(cls.waiters))
        for callback in cls.waiters:
            try:
                callback(messages)
            except:
                logging.error("Error in waiter callback", exc_info=True)
        cls.waiters = []

class MessageNewHandler(BaseHandler, MessageMixin):
    @tornado.web.authenticated
    def post(self):

        r = redis.Redis()
        r.select(6)

        message_index = r.llen('room:1')
        message = {
          'id': str(message_index),
          'from': self.current_user,
          'body': self.get_argument("body"),
        }
        r.push('room:1', json.dumps(message))
        
        message["html"] = self.render_string("message.html", message = message)
        if self.get_argument("next", None):
            self.redirect(self.get_argument("next"))
        else:
            self.write(message)
        self.new_messages([message])


class MessageUpdatesHandler(BaseHandler, MessageMixin):
    @tornado.web.authenticated
    @tornado.web.asynchronous
    def post(self):
        cursor = self.get_argument("cursor", None)
        self.wait_for_messages(self.async_callback(self.on_new_messages),
                               cursor=cursor)

    def on_new_messages(self, messages):
        # Closed client connection
        if self.request.connection.stream.closed():
            return
        self.finish(dict(messages=messages))


class AuthLoginHandler(BaseHandler):
    #@tornado.web.asynchronous
    def get(self):
        self.write('<html><body><form action="/auth/login" method="post">'
          'Name: <input type="text" name="name">'
          '<input type="submit" value="Sign in">'
          '</form></body></html>')
    
    def post(self):
        self.set_secure_cookie("user",  self.get_argument("name"))
        self.redirect("/")


class AuthLogoutHandler(BaseHandler):
    def get(self):
        self.clear_cookie("user")
        self.redirect("/")


def main():
    tornado.options.parse_command_line()
    http_server = tornado.httpserver.HTTPServer(Application())
    http_server.listen(options.port)
    tornado.ioloop.IOLoop.instance().start()


if __name__ == "__main__":
    main()
