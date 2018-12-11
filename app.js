var express = require('express'),
    app = express(),
    db = require('./models'),
    bodyParser = require('body-parser'),
    fileSystem = require('fs'),
    mime = require('mime-types'),
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

// Create Project route to start Video manipulation service
app.get('/project/create', function (req, res) {

    var projectId;

    /**
     * TODO
     * 1 - Extract Project ZIP and store in 'projects' dir
     * 2 - Google Cloud authentication
     */

    // Create project entry in db
    db.Project.create({
        name: req.body.name,
        zipUrl: req.body.zipUrl
    })
        .then(function (project) {

            projectId = project._id;

            // Read the directories present in path
            var items = fileSystem.readdirSync(projectDir)

            // Iterate through files, directories will contain media files
            for (i = 0; i < items.length; i++) {
                if (fileSystem.lstatSync(projectDir + "/" + items[i]).isDirectory()) {

                    readSlideDirectory(projectId, i, items[i], items.length);

                }
            }

            res.json({
                message: "Project create reqeust has been spawned!"
            });
        })
        .catch(function (err) {
            console.log(err);
        });

});

// Read the contents of directory and identify file types(mime)
function readSlideDirectory(projectId, i, item, length) {

    var mediaFiles = fileSystem.readdirSync(projectDir + "/" + item)

    // Check the file type of first file
    var mimeType = (mime.lookup(mediaFiles[0])).split("/")[0];
    var slideData = {
        slideOrder: i + 1,
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

        mediaFiles.forEach(function (file) {

            if (file !== "scaled.mp4") {
                slideData.videoFile = file;
            }

        });


    }

    // Push the slide data into Project entry
    db.Project.findOneAndUpdate({ _id: projectId },
        {
            $push: {
                slides: slideData
            }
        })
        .then(function (result) {
            console.log("Insert: slide data in project entry");

            if (i === length - 1) {
                mainStitchFunc(projectId);
            }

        })
        .catch(function (err) {
            console.log(err);
        });
}

// Search the database for project entry and start stitching function 
function mainStitchFunc(projectId) {
    console.log("Request recieved: Video Stitiching initialization");

    db.Project.findById(projectId)
        .then(function (result) {

            var slides = result.slides;
            startMergingImageAudio(projectId, slides);
            startScalingVideos(projectId, slides);

        })
        .catch(function (err) {
            console.log(err);
        });

};

// Starts sequence of merging Image and Audio to make Video
function startMergingImageAudio(projectId, slides) {

    for (var i = 0; i < slides.length; i++) {

        if (slides[i].type === 1) {

            var imageFile = "./projects/" + slides[i].slideOrder + "/" + slides[i].imageFile;
            var audioFile = "./projects/" + slides[i].slideOrder + "/" + slides[i].audioFile;
            var fileToConcat = "./projects/" + slides[i].slideOrder + "/merged.mp4";

            ffmpegAudioProbe(imageFile, audioFile, fileToConcat, projectId, slides[i].slideOrder);

        }

    }
}

// Probe the Audio file to get the File metadata, we need duration for now
function ffmpegAudioProbe(imageFile, audioFile, fileToConcat, projectId, slideOrder) {
    console.log("Request recieved: Audio probe");

    var images, duration, videoOptions;

    ffmpeg(audioFile)
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
                size: '1280x720',
                format: 'mp4',
                pixelFormat: 'yuv420p'
            }

            // Set of images with the duration obtained from ffprobe
            images = [{
                path: imageFile,
                loop: duration
            }]

            ffmpegVideoMerge(images, audioFile, videoOptions, fileToConcat, projectId, slideOrder);

        });

}

// Function to merge Audio and Image to create Video
function ffmpegVideoMerge(images, audioFile, videoOptions, fileToConcat, projectId, slideOrder) {
    console.log("Request recieved: Image - Audio merge");

    videoshow(images, videoOptions)
        .audio(audioFile)
        .save(fileToConcat)
        .on('start', function (command) {
            console.log('FFMPEG spawned for Image-Audio merge:', command)
        })
        .on('error', function (err, stdout, stderr) {
            console.error('FFMPEG Image-Audio merge Error:', err)
            console.error('FFMPEG Image-Audio merge stderr:', stderr)
        })
        .on('end', function (output) {
            console.error('FFMPEG Image-Audio merge output:', output)

            // Update the project entry with fileToConcat
            db.Project.findOneAndUpdate({ _id: projectId, 'slides.slideOrder': slideOrder },
                {
                    '$set': {
                        "slides.$.fileToConcat": fileToConcat
                    }
                }, { new: true })
                .then((result) => {
                    checkForFilesToConcat(projectId);
                })
                .catch((err) => {
                    console.log(err);
                })

        });

}

// Starts the squence of scaling video
function startScalingVideos(projectId, slides) {

    for (var i = 0; i < slides.length; i++) {

        if (slides[i].type === 0) {

            var slideOrder = slides[i].slideOrder;

            var videoFile = "./projects/" + slideOrder + "/" + slides[i].videoFile;
            var fileToConcat = "./projects/" + slideOrder + "/scaled.mp4";

            ffmpegScaleVideo(projectId, slides[i].slideOrder, videoFile, fileToConcat);

        }

    }
}

// To scale videos of different resolutions for robust concat
function ffmpegScaleVideo(projectId, slideOrder, videoFile, fileToConcat) {
    console.log("Request received: Scale video");

    ffmpeg(videoFile)
        .output(fileToConcat)
        .size("1280x720")
        .on('start', function (commandLine) {
            console.log('FFMPEG spawned for scaling video: ' + commandLine);
        })
        .on('error', function (err) {
            console.log('FFMPEG scaling video error: ' + err.message);
        })
        .on('end', function () {
            console.log('FFMPEG scaling video finished!');

            // Update the project entry with fileToConcat
            db.Project.findOneAndUpdate({ _id: projectId, 'slides.slideOrder': slideOrder },
                {
                    '$set': {
                        "slides.$.fileToConcat": fileToConcat
                    }
                }, { new: true })
                .then((result) => {
                    checkForFilesToConcat(projectId);
                })
                .catch((err) => {
                    console.log(err);
                })

        })
        .run();

}

// Checks the project entry whether all slides have Video file
// before processding for final video concatenation 
function checkForFilesToConcat(projectId) {

    db.Project.findOne({ _id: projectId })
        .then((result) => {

            var slides = result.slides,
                isReady = true,
                files = [];

            for (var i = 0; i < slides.length; i++) {

                files.push({
                    order: slides[i].slideOrder,
                    file: slides[i].fileToConcat
                });

                if (slides[i].fileToConcat === null || slides[i].fileToConcat === "") {
                    isReady = false;
                }

            }

            if (isReady) {
                ffmpegConcatVideos(files);
            }

        })
        .catch((err) => {
            console.log(err);
        });

}

// Concat video files
function ffmpegConcatVideos(inputs) {
    console.log("Request recieved: Video concatination");

    var ffm = ffmpeg(inputs[0].file);

    for (var i = 1; i < inputs.length; i++) {
        ffm.mergeAdd(inputs[i].file);
    }

    ffm
        .on('start', function (commandLine) {
            console.log('FFMPEG spawned for video concat: ' + commandLine);
        })
        .on('error', function (err) {
            console.log('FFMPEG video concat error: ' + err.message);
        })
        .on('end', function () {
            console.log('FFMPEG video concat finished!');
        })
        .mergeToFile('./temp/concat.mp4', './cache');    // needs a temporary folder as second argument

}

// Listen to the default PORT for incoming request
app.listen(app.get('port'), function () {
    console.log("Server is running on " + app.get('port'));
});
