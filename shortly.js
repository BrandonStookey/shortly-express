var express = require('express');
var util = require('./lib/utility');
var session = require('express-session');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(session({secret: 'nyan cat'}));
var session;

app.get('/', 
function(req, res) {
  restrict(req, res, function(){
    res.render('index');
  });
});

app.get('/create', 
function(req, res) {
  restrict(req, res, function(){
    res.render('index');
  });
});

app.get('/login', 
function(req, res) {
  req.session.user = undefined;
  res.render('login');
});

app.post('/login', 
  function(req, res) {
    
    var username = req.body.username;
    
    new User({'username': username}).fetch()
      .then(function(model) {
        if (model) {
          bcrypt.compare(req.body.password, model.get('password'), function(err,match){
            console.log(match);
            if (match) {
              createSession(req, res, username);
            } else {
              res.send(418);
            }
            
          });
        } else {
          res.redirect('/login');
        }
      }
    );
  }
);


app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.post('/signup', 
  function(req, res) {
    var username = req.body.username;
    var password = encrypt(req.body.password);
    
    new User({username: username}).fetch().then(function(found) {
      if (found) {
        res.send(409);
      } else {
        var user = new User ({username: username, password: password});
        
        user.save().then(function(newUser) {
          Users.add(newUser);
          createSession(req, res, username);
        });
      }
    })
});

app.get('/links', 
function(req, res) {
  restrict(req,res, function () {
    Links.reset().fetch().then(function(links) {
      res.send(200, links.models);
    });
  });
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      console.log('found ', found.attributes);
      return res.send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});
/************************************************************/
// Write your authentication routes here
/************************************************************/



 



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);



function restrict(req, res, cb) {
  if (req.session.user) {
    cb();
  } else {
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
}

function encrypt(raw){
  return bcrypt.hashSync(raw, bcrypt.genSaltSync());
}

function createSession(req, res, username) {
  session = req.session;
  session.user =  username;
  res.redirect('/');
}