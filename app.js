var express = require('express'),
    app = express(),
    db = require('./models'),
    bodyParser = require('body-parser'),
    mime = require('mime-types'),
    fileSystem = require('fs'),
    ffmpeg = require('fluent-ffmpeg'),
    videoshow = require('videoshow'),
    projectDir = "./projects";

// Setup body parse to receive json format requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set PORT
app.set('port', (process.env.PORT || 5000));

// Root route greeting message
app.get('/', function (req, res) {
    res.send("Welcome to Video Manipulation API!");
});

// Route to start Video manipulation service
app.get('/project/create', function (req, res) {

    /**
     * TODO
     * 1 - Extract Project ZIP and store in 'projects' dir
     * 2 - Google Cloud authentication
     * 3 - Accept request body to remove hardcoding
     */

    //Create project entry in db
    db.Project.create({
        name: "Dummy",
        url: "dummy-url"
    })
        .then(function (project) {

            // Read the directories present in path
            fileSystem.readdir(projectDir, function (err, items) {
                // Iterate through files, directories will contain media files
                for (i = 0; i < items.length; i++) {
                    if (fileSystem.lstatSync(projectDir + "/" + items[i]).isDirectory()) {

                        readSlideDirectory(project._id, i, items[i], items.length);

                    }
                };
            });

            res.send("Project create reqeust has been spawned!");
        })
        .catch(function (err) {
            console.log(err);
        });


});

// Read the contents of directory and identify file types(mime)
function readSlideDirectory(projectId, i, item, length) {

    fileSystem.readdir(projectDir + "/" + item, function (err, mediaFiles) {

        // Check the file type of first file
        var mimeType = (mime.lookup(mediaFiles[0])).split("/")[0];
        var slideData = {
            order: i + 1,
            status: 0
        };

        // Edit the slide data according to Media file type
        if (mimeType === "audio" || mimeType === "image") {

            slideData.type = 1

            mediaFiles.forEach(function (file) {

                mimeType = mime.lookup(file).split("/")[0];

                if (mimeType === "image") {
                    slideData.imageFile = file;
                }
                if (mimeType === "audio") {
                    slideData.audioFile = file;
                }

            });

        } else if (mimeType === "video") {

            slideData.type = 0
            slideData.videoFile = mediaFiles;

        }

        // Push the slide data into Project entry
        db.Project.findOneAndUpdate({ _id: projectId },
            {
                $push: {
                    slides: slideData
                }
            })
            .then(function(result) {
                console.log("Insert: slide data in project entry");
            })
            .catch(function (err) {
                console.log(err);
            });

        if (i === length - 1) {
            // Use timeout as I still don't know how to handle async's correctly.
            setTimeout(mainStitchFunc, 3000);
        }
    });

}

function mainStitchFunc(projectId) {

    db.Project.findOne(projectId)
        .then(function(result) {

        })
        .catch(function (err) {
            console.log(err);
        });

};

function concatVideos(inputs) {

    var ffm = ffmpeg();

    inputs.forEach(function (input) {
        ffm.addInput(input);
    });

    ffm
    .on('start', function (commandLine) {
        console.log('Spawned FFMPEG with command: ' + commandLine);
    })
    .on('error', function (err) {
        console.log('An error occurred: ' + err.message);
    })
    .on('end', function () {
        console.log('Merging finished !');
    })
    .mergeToFile('./temp/concat.mp4', './cache');    // needs a temporary folder as second argument

}

// Route to test Video Concatenation
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

// Route to test Image and Audio merging
app.get('/project/imgconcat', function (req, res) {

    var images, duration, videoOptions;

    // Probe the Audio file to get the File metadata, we need duration for now
    function audioProbe(callback) {

        ffmpeg('./temp/image.jpg')
            .ffprobe(function (err, data) {
                console.log(data);
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

                //callback();

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