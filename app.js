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
     * 3 - Accept request body to remove hardcoding
     */

    // Create project entry in db
    db.Project.create({
        name: "Dummy",
        url: "dummy-url"
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


            res.send("Project create reqeust has been spawned!");
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
            mergeImageAudio(projectId, slides);

        })
        .catch(function (err) {
            console.log(err);
        });

};

// Starts sequence of merging Image and Audio to make Video
function mergeImageAudio(projectId, slides) {

    for (var i = 0; i < slides.length; i++) {

        if (slides[i].type === 1) {

            //TODO: Call VideoShow and then query database for all output file in ConcatVideo
            var imageFile = "./projects/" + slides[i].order + "/" + slides[i].imageFile;
            var audioFile = "./projects/" + slides[i].order + "/" + slides[i].audioFile;
            var outputFile = "merged.mp4";

            audioProbe(imageFile, audioFile, outputFile, projectId, slides[i].order);

        }

    };


}

// Probe the Audio file to get the File metadata, we need duration for now
function audioProbe(imageFile, audioFile, outputFile, projectId, slideOrder) {
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
                size: '1920x1080',
                format: 'mp4',
                pixelFormat: 'yuv420p'
            }

            // Set of images with the duration obtained from ffprobe
            images = [{
                path: imageFile,
                loop: duration
            }]

            videoMerge(images, audioFile, videoOptions, outputFile, projectId, slideOrder);

        });

}

// Function to merge Audio and Image to create Video
function videoMerge(images, audioFile, videoOptions, outputFile, projectId, slideOrder) {
    console.log("Request recieved: Image - Audio merge");

    videoshow(images, videoOptions)
        .audio(audioFile)
        .save("./projects/" + slideOrder + "/" + outputFile)
        .on('start', function (command) {
            console.log('FFMPEG process started for Image-Audio merge:', command)
        })
        .on('error', function (err, stdout, stderr) {
            console.error('FFMPEG Error:', err)
            console.error('FFMPEG stderr:', stderr)
        })
        .on('end', function (output) {
            console.error('FFMPEG Merged video created in:', output)

            // Update the project entry with OutputFile as VideoFile
            db.Project.findOneAndUpdate({ _id: projectId, slides: { $elemMatch: { order: slideOrder } } },
                {
                    "$set": {
                        "slides.$.videoFile": outputFile
                    }
                })
                .then((result) => {
                    checkForVideoFile();
                })
                .catch((err) => {
                    console.log(err);
                })

        });

}

// Checks the project entry whether all slides have Video file
// before processding for final video concatenation 
function checkForVideoFile(projectId) {

    db.Project.findOne(projectId)
        .then((result) => {

            var slides = result.slides,
                isReady = true,
                outputFiles = [];

            for (var i = 0; i < slides.length; i++) {

                outputFiles.push({
                    order: slides[i].order,
                    file: slides[i].videoFile
                });

                if (slides[i].outputFile === null || slides[i].outputFile === "") {
                    isReady = false;
                }

            }

            if (isReady) {
                concatVideos(outputFiles);
            }


        })
        .catch((err) => {
            console.log(err);
        });

}

// Concat video files
function concatVideos(inputs) {
    console.log("Request recieved: Video concatination");

    var ffm = ffmpeg("./projects/" + inputs[0].order + "/" + inputs[0].file);

    for (var i = 1; i < inputs.length; i++) {
        ffm.mergeAdd("./projects/" + inputs[i].order + "/" + inputs[i].file);
    }

    ffm
        .complexFilter(["scale=w=1280:h=720"])
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

// Listen to the default PORT for incoming request
app.listen(app.get('port'), function () {
    console.log("Server is running on " + app.get('port'));
});