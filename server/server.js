
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Optional: For cross-origin requests

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
app.use(cors());                  // Enable CORS
app.use(express.json());          // Parse incoming JSON requests
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// --- ROUTES ---
// Base Route
app.get('/', (req, res) => {
    res.json({ message: "Welcome to the Node.js Express server!" });
});

// Example API Route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: "UP", timestamp: new Date() });
});

// 404 Error Handler
app.use((req, res, resNext) => {
    res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong on the server" });
});

// --- SERVER ACTIVATION ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


