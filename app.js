var express     = require('express'),
    app         = express(),
    bodyParser  = require('body-parser'),
    ffmpeg      = require('fluent-ffmpeg');    

// Setup body parse to receive json format requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Set PORT
app.set('port', (process.env.PORT || 5000));

// Root route greeting message
app.get('/', function(req, res){
    res.send("Welcome to Video Manipulation API!");
});

app.get('/project/vidconcat', function(req, res){

    ffmpeg('./temp/vid1.mp4')
    .input('./temp/vid2.mp4')
    .on('start', function(commandLine) {
        console.log('Spawned Ffmpeg with command: ' + commandLine);
        res.send("Spawned Ffmpeg for merging")
    })
    .on('error', function(err) {
      console.log('An error occurred: ' + err.message);
    })
    .on('end', function() {
      console.log('Merging finished !');
    })
    .mergeToFile('./temp/ffoutput.mp4', './cache');    // needs a temporary folder as second argument

});


// Listen to the default PORT for incoming request
app.listen(app.get('port'), function(){
    console.log("Server is running on " + app.get('port'));
});