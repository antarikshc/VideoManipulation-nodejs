var mongoose = require('mongoose');

// Setup projectSchema
var projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: "Name cannot be blank!"
    },
    url: String,
    slides: {
        order: Number,
        type: Number, // 0 - Video, 1 - Audio/Image
        fileOne: String,
        fileTwo: String,
        status: Number // 0 - Not processed, 1 - Finished processing
    },
    output: String
});

// Export back to /models/index
module.exports = mongoose.model("Project", projectSchema);