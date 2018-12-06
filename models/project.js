var mongoose = require('mongoose');

// Setup projectSchema
var projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: "Name cannot be blank!"
    },
    url: String,
    slides: [{
        order: {type: Number},
        type: {type: Number}, // 0 - Video, 1 - Audio/Image
        fileOne: {type: String},
        fileTwo: {type: String},
        status: {type: Number} // 0 - Not processed, 1 - Finished processing
    }],
    output: String
});

// Export back to /models/index
module.exports = mongoose.model("Project", projectSchema);