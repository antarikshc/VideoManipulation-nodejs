var express     = require('express'),
    app         = express(),
    db          = require('./models'),
    bodyParser  = require('body-parser'),
    fileSystem  = require('fs'),
    unzip       = require('unzip-stream'),
    mime        = require('mime-types'),
    ffmpeg      = require('fluent-ffmpeg'),
    imageResize = require('sharp'),
    videoshow   = require('videoshow'),
    projectDir  = "./projects/";

// Imports the Google Cloud client library
const {Storage} = require('@google-cloud/storage');

// Creates a GCP Storage client
const storage = new Storage({
    projectId: "impactful-study-190010",
});

const bucketName = "lvcms-development-testing";

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
app.post('/project/create', function (req, res) {

    init(req, res);

});

// Starting point for API
async function init(req, res) {

    res.json({
        message: "Project create reqeust has been spawned!"
    });
    
    const srcFilename = "zips/" + req.body.zipUrl;
    const destFilename = "./zips/" + req.body.zipUrl;

    console.log(`Downloading ${srcFilename} from ${bucketName}`);

    // Downloads the file from bucket
    await storage
    .bucket(bucketName)
    .file(srcFilename)
    .download({
        destination: destFilename
    });

    console.log(`GS://${bucketName}/${srcFilename} downloaded to ${destFilename}.`);

    // Extract the project archieve
    console.log("Extracting project archieve")
    fileSystem.createReadStream(destFilename)
    .pipe(unzip.Extract({
        path: projectDir + req.body.name + "/"
    }))
    .on('close', function(items){
        createProjectEntry(req.body.name, req.body.zipUrl, req.body.resolution);
    });

}

// Creates database entry and starts scanning project files
function createProjectEntry(projectName, projectZip, vidRes) {

    var projectId;

    // Create project entry in db
    db.Project.create({
        name: projectName,
        zipUrl: projectZip,
        resolution: vidRes
    })
        .then(function (project) {

            projectId = project._id;

            // Read the directories present in path
            var items = fileSystem.readdirSync(projectDir + project.name + "/")

            // Iterate through files, directories will contain media files
            for (i = 0; i < items.length; i++) {
                if (fileSystem.lstatSync(projectDir + project.name + "/" + items[i]).isDirectory()) {

                    readProjectDirectory(projectId, project.name, i, items[i], items.length);

                }
            }

        })
        .catch(function (err) {
            console.log(err);
        });

}

// Read the contents of directory and identify file types(mime)
function readProjectDirectory(projectId, name, i, item, length) {

    var mediaFiles = fileSystem.readdirSync(projectDir + name + "/" + item)

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
                initVideoStitching(projectId);
            }

        })
        .catch(function (err) {
            console.log(err);
        });
}

// Search the database for project entry and initiate stitching function 
function initVideoStitching(projectId) {
    console.log("Request recieved: Video Stitiching initialization");

    db.Project.findById(projectId)
        .then(function (result) {

            var slides = result.slides;
            startMergingImageAudio(projectId, result.name, slides, result.resolution);
            startScalingVideos(projectId, result.name, slides, result.resolution);

        })
        .catch(function (err) {
            console.log(err);
        });

};

// Starts sequence of merging Image and Audio to make Video
function startMergingImageAudio(projectId, name, slides, resolution) {

    for (var i = 0; i < slides.length; i++) {

        if (slides[i].type === 1) {

            var imageFile = projectDir + name + "/" + slides[i].slideOrder + "/" + slides[i].imageFile;
            var resizedImg = projectDir + name + "/" + slides[i].slideOrder + "/resized_" + slides[i].imageFile;
            var audioFile = projectDir + name + "/" + slides[i].slideOrder + "/" + slides[i].audioFile;
            var fileToConcat = projectDir + name + "/" + slides[i].slideOrder + "/merged.mp4";

            ffmpegAudioProbe(imageFile, resizedImg, audioFile, fileToConcat, 
                projectId, slides[i].slideOrder, resolution);

        }

    }
}

// Probe the Audio file to get the File metadata, we need duration for now
function ffmpegAudioProbe(imageFile, resizedImg, audioFile, fileToConcat, projectId, slideOrder, resolution) {
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
                size: resolution,
                format: 'mp4',
                pixelFormat: 'yuv420p'
            }

            var width = parseInt(resolution.split("x")[0]);
            var height = parseInt(resolution.split("x")[1]);

            // Resize Image and call Video Merge
            imageResize(imageFile)
            .resize(width, height)
            .toFile(resizedImg, (err, data) => {
                if (err) {
                    console.log("Cannot resize Image");
                } else {

                    // Set of images with the duration obtained from ffprobe
                    images = [{
                        path: resizedImg,
                        loop: duration
                    }]

                    ffmpegVideoMerge(images, audioFile, videoOptions, fileToConcat, projectId, slideOrder);

                }
            });

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
                        "slides.$.fileToConcat": fileToConcat,
                        "slides.$.status": 1
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
function startScalingVideos(projectId, name, slides, resolution) {

    for (var i = 0; i < slides.length; i++) {

        if (slides[i].type === 0) {

            var slideOrder = slides[i].slideOrder;

            var videoFile = projectDir + name + "/" + slideOrder + "/" + slides[i].videoFile;
            var fileToConcat = projectDir + name + "/" + slideOrder + "/scaled.mp4";

            ffmpegScaleVideo(projectId, slides[i].slideOrder, videoFile, fileToConcat, resolution);

        }

    }
}

// To scale videos of different resolutions for robust concat
function ffmpegScaleVideo(projectId, slideOrder, videoFile, fileToConcat, resolution) {
    console.log("Request received: Scale video");

    ffmpeg(videoFile)
        .output(fileToConcat)
        .size(resolution)
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
                        "slides.$.fileToConcat": fileToConcat,
                        "slides.$.status": 1
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
    console.log("Checking for Video Concatenation");

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

                if (slides[i].status === 0) {
                    isReady = false;
                }

            }

            if (isReady) {
                ffmpegConcatVideos(result.name, files);
            }
            

        })
        .catch((err) => {
            console.log(err);
        });

}

// Concat video files
function ffmpegConcatVideos(name, inputs) {
    console.log("Request recieved: Video concatination");

    var output = "./videos/" + name + ".mp4"

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
            uploadFile(name + ".mp4");
        })
        .mergeToFile(output, './cache');    // needs a temporary folder as second argument

}

// Uploading the file back to bucket
async function uploadFile(fileName) {

    // Creates a GCP Storage client
    const storage = new Storage({
        projectId: "impactful-study-190010",
    });

    console.log(`Uploading ${fileName} in ${bucketName}`)

    // Uploads a local file to the bucket
    await storage.bucket(bucketName).upload("./videos/" + fileName, {
        destination: "/videos/" + fileName,
        // Support for HTTP requests made with `Accept-Encoding: gzip`
        gzip: true,
        metadata: {
        // Enable long-lived HTTP caching headers
        // Use only if the contents of the file will never change
        // (If the contents will change, use cacheControl: 'no-cache')
        cacheControl: 'public, max-age=31536000',
        },
    });
    
    console.log(`GS://${fileName} uploaded to ${bucketName}.`);
    console.log("Exiting Task.");

}

// Listen to the default PORT for incoming request
app.listen(app.get('port'), function () {
    console.log("Server is running on " + app.get('port'));
});
