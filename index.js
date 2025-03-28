require("dotenv").config();
const express = require("express");
const axios = require("axios");
const Redis = require("redis");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3030;

const redisClient = Redis.createClient({
    socket: {
        host: process.env.REDIS_HOST   || "127.0.0.1",   
        port: process.env.REDIS_PORT   || 6379,
    }
});

redisClient.connect().catch(err => {console.error("Redis connection error:", err)});

// to apply rate limiting to all requests

const ratelimiter = rateLimit({windowMs: 60 * 1000, max: 100, message: "Too many requests, please try again later."});
app.use(ratelimiter);
app.use(express.json());

// API Url for USGS Earthquake 

const USGS_API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/";

app.get("/earthquakes", async (req, res) => {

    const {startTime, endTime, minMagnitude, maxMagnitude} = req.query;
    const cacheKey = `earthquake_${crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex')}`;

    try{
            const cachedData = await redisClient.get(cacheKey);
            if(cachedData){
                console.log("Cache data is used for this request.");
                return res.status(200).json(JSON.parse(cachedData));
            }

            let apiUrl = `${USGS_API_URL}`;
            let params = {};
            if(startTime) params.push(`startTime = ${startTime}`);
            if(endTime) params.push(`endTime = ${ endTime}`);
            if(minMagnitude) params.push(`minMagnitude = ${minMagnitude}`);
            if(maxMagnitude) params.push(`maxMagnitude = ${maxMagnitude}`);

            if (params.length) {
                apiUrl += "&" + params.join("&");
            }

            console.log("Fetching fresh earthquake data...");
            const response = await axios.get(apiUrl);
            const data = response.data;
            await redisClient.setEx(cacheKey, 600, JSON.stringify(data));
            res.json(data);

        }catch (error) {
        console.error("Error fetching earthquake data:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }

});
// get request for fetching single id data
app.get("/earthquakes/:id", async (req, res) => {
    const earthquakeId = req.params.id;
    const cacheKey = `earthquake_${earthquakeId}`;

    try {
        // Check Redis Cache for serving recently fetched data from cache
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                console.log(`Returning cached earthquake data for ID: ${earthquakeId}`);
                return res.json(JSON.parse(cachedData));
            }

                console.log(`Fetching earthquake details for ID: ${earthquakeId}...`);
                const response = await axios.get(`${USGS_API_URL}&eventid=${earthquakeId}`);
                const data = response.data;

                await redisClient.setEx(cacheKey, 600, JSON.stringify(data));
                res.json(data);
                
        }catch (error) {
            console.error("Error fetching earthquake details:", error.message);
            res.status(500).json({ error: "Internal server error" });
        }      

});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



