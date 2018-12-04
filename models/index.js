var mongoose = require('mongoose');

// Setup mongoose
mongoose.set('debug', true);
mongoose.connect('mongodb://localhost/lvcreate_projects', {useNewUrlParser: true});

mongoose.Promise = Promise;