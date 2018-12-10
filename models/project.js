var mongoose = require('mongoose');

// Setup projectSchema
var projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: "Name cannot be blank!"
    },
    url: String,
    slides: [{
        slideOrder: {type: Number},
        type: {type: Number}, // 0 - Video, 1 - Audio/Image
        imageFile: {type: String},
        audioFile: {type: String},
        videoFile: {type: String},
        fileToConcat: {type: String},
        status: {type: Number} // 0 - Not processed, 1 - Finished processing
    }],
    output: String
});

// Export back to /models/index
module.exports = mongoose.model("Project", projectSchema);