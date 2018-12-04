var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    db = require('./models'),
    ffmpeg = require('fluent-ffmpeg'),
    videoshow = require('videoshow');

// Setup body parse to receive json format requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set PORT
app.set('port', (process.env.PORT || 5000));

// Root route greeting message
app.get('/', function (req, res) {
    res.send("Welcome to Video Manipulation API!");
});

app.get('/project/vidconcat', function (req, res) {

    // Currently hardcoding concatenation of two videos
    ffmpeg('./temp/vid1.mp4')
        .input('./temp/vid2.mp4')
        .on('start', function (commandLine) {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
            res.send("Spawned Ffmpeg for merging")
        })
        .on('error', function (err) {
            console.log('An error occurred: ' + err.message);
        })
        .on('end', function () {
            console.log('Merging finished !');
        })
        .mergeToFile('./temp/ffoutput.mp4', './cache');    // needs a temporary folder as second argument

});

app.get('/project/imgconcat', function (req, res) {

    var images, duration, videoOptions;

    // Probe the Audio file to get the File metadata, we need duration for now
    function audioProbe(callback) {

        ffmpeg('./temp/song.mp3')
            .ffprobe(function (err, data) {
                duration = parseInt(data.streams[0].duration);

                // Video options to render the video
                videoOptions = {
                    fps: 25,
                    transition: true,
                    transitionDuration: 1, // seconds
                    videoBitrate: 1024,
                    videoCodec: 'libx264',
                    audioBitrate: '128k',
                    audioChannels: 2,
                    format: 'mp4',
                    pixelFormat: 'yuv420p'
                }

                // Set of images with the duration obtained from ffprobe
                images = [{
                    path: './temp/image.jpg',
                    loop: duration
                }]

                callback();

            });

    }

    // Function to merge Audio and Image to create Video
    function videoMerge() {

        videoshow(images, videoOptions)
            .audio('./temp/song.mp3')
            .save('./temp/outputshow.mp4')
            .on('start', function (command) {
                console.log('ffmpeg process started:', command)
            })
            .on('error', function (err, stdout, stderr) {
                console.error('Error:', err)
                console.error('ffmpeg stderr:', stderr)
            })
            .on('end', function (output) {
                console.error('Video created in:', output)
            });

    }

    audioProbe(videoMerge);

});


// Listen to the default PORT for incoming request
app.listen(app.get('port'), function () {
        console.log("Server is running on " + app.get('port'));
    });