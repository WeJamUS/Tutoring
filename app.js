"use strict";

const express = require("express");
const multer = require("multer");
const request = require("request");
const {Pool} = require('pg');
require('dotenv').config();
const app = express();

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(multer().none());

const INVALID_PARAM_ERROR = 400;
const SERVER_ERROR = 500;
const SERVER_ERROR_MSG = "Something went wrong on the server, please try again later.";
const pool = new Pool({
  ssl: {
    rejectUnauthorized: false
  },
  connectionString: process.env.DATABASE_URL
});

// month is incremented from 0, date is incremented from 1
/*
 * Retrieves the sessions available on the requested date from database
 */
app.get("/session", async function(req, res) {
  try {
    if (req.query.date) {
      let response = await getAllSessions(req.query.date);
      if (response.length === 0) {
        res.status(INVALID_PARAM_ERROR).json({"error": "No available sessions for today"});
      } else {
        res.json({"sessions": response});
      }
    } else {
      res.status(INVALID_PARAM_ERROR).json({"error": "Missing date parameters"});
    }
  } catch (error) {
    res.status(SERVER_ERROR).json({"error": SERVER_ERROR_MSG});
  }
});

/*
 * Schedules the selected meeting by adding the user's name and email to the database
 */
app.post("/schedule", async function(req, res) {
  try {
    let sessions = req.body.sessions;
    let sessionsArray = sessions.split(",");
    let tutorId = await scheduleSession(req.body.name, req.body.email, sessionsArray);
    res.json({"date": sessionsArray[0], "id": tutorId, "email": req.body.email});
  } catch (error) {
    console.log(error);
    res.status(SERVER_ERROR).json({"error": SERVER_ERROR_MSG});
  }
});

/*
 * Uses the passed in zoom authorization code to get a zoom access token
 * Store the access token, refresh token and expiration time in database
 */
app.get("/authorizationCode", async function(req, res) {
  try {
    if (req.query.authorizationCode) {
      let options = {
        method: 'POST',
        headers: {
          "Authorization": "Basic " + process.env.ZOOM_CREDENTIALS
        },
        url: 'https://zoom.us/oauth/token?grant_type=authorization_code&redirect_uri=https://blooming-wildwood-89768.herokuapp.com/authorization.html&code=' + req.query.authorizationCode
      };
      await request(options, async function(error, response, body) {
        if (error) {
          console.log(error);
          throw new Error(error);
        }
        let resp = JSON.parse(body);
        let date = new Date();
        let expirationDate = date.getTime() + 3500000;
        console.log(expirationDate);
        console.log(resp.access_token);
        console.log(resp.refresh_token);
        if (resp.access_token !== undefined && resp.refresh_token !== undefined) {
          await storeAccessToken(resp.access_token, resp.refresh_token, expirationDate);
        } else {
          throw new Error("Invalid access or refresh tokens returned");
        }
        res.json({"date": expirationDate});
      });
    }
  } catch (error) {
    console.log(error);
    res.status(SERVER_ERROR).json({"error": SERVER_ERROR_MSG});
  }
});

/*
 * Uses the refresh token to request a new access token and refresh token
 * Stores the new access token, new refresh token and new expiration date in database
 */
app.get("/refreshToken", async function(req, res) {
  try {
    // let refreshToken = await query("SELECT refresh_token FROM zoom_oauth;");
    let refreshToken = await pgQuery("SELECT refresh_token, expiration_date FROM zoom_oauth;", []);
    let date = new Date();
    if (refreshToken[0].expiration_date <= date.getTime()) {
      let options = {
        method: "Post",
        headers: {
          "Authorization": "Basic " + process.env.ZOOM_CREDENTIALS
        },
        url: "https://zoom.us/oauth/token?grant_type=refresh_token&refresh_token=" + refreshToken[0].refresh_token
      };
      await request(options, async function(error, response, body) {
        if (error) {
          console.log(error);
          throw new Error(error);
        }
        let resp = JSON.parse(body);
        let expirationDate = date.getTime() + 3500000;
        if (resp.access_token !== undefined && resp.refresh_token !== undefined) {
          await storeAccessToken(resp.access_token, resp.refresh_token, expirationDate);
          res.json(body);
        } else {
          throw new Error("Invalid access or refresh tokens returned");
        }
      });
    } else {
      res.json({"status": "not expired"});
    }
  } catch (error) {
    console.log(error);
    res.status(SERVER_ERROR).json({"error": SERVER_ERROR_MSG});
  }
});

// makes sure access token isn't expired.
/*
 * Uses the zoom access token to request the creation of a new zoom meeting with the
 * scheduled session date and time
 */
app.get("/createMeeting", async function(req, res) {
  try {
    if (req.query.date) {
      // let accessToken = await query("SELECT access_token FROM zoom_oauth;");
      let accessToken = await pgQuery("SELECT access_token FROM zoom_oauth;", []);
      let options = {
        method: 'POST',
        url: 'https://api.zoom.us/v2/users/jzwu12@gmail.com/meetings',
        headers: {
          'content-type': 'application/json',
          "authorization": 'Bearer ' + accessToken[0].access_token
        },
        body: {
          topic: 'Tutoring Test meeting',
          type: 2,
          start_time: req.query.date,
          duration: 30,
          schedule_for: 'jzwu12@gmail.com',
          timezone: 'America/Los_Angeles',
          password: '',
          agenda: 'Math tutoring with James',
          settings: {
            host_video: false,
            participant_video: false,
            cn_meeting: false,
            in_meeting: false,
            join_before_host: true,
            mute_upon_entry: true,
            watermark: false,
            use_pmi: false,
            approval_type: 2,
            audio: 'both',
            auto_recording: 'none',
            enforce_login: false,
            enforce_login_domains: '',
            alternative_hosts: '',
            global_dial_in_countries: [],
            registrants_email_notification: false
          }
        },
        json: true
      };
      await request(options, function(error, response, body) {
        if (error) {
          throw new Error(error);
        }
        storeJoinURL(body.join_url, req.query.date, req.query.id);
        res.json(body);
      });
    } else {
      res.status(INVALID_PARAM_ERROR).json({"error": "Missing date parameter"});
    }
  } catch (error) {
    console.log(error);
    res.status(SERVER_ERROR).json({"error": SERVER_ERROR_MSG});
  }
});

// ----------------------- SESSION HELPER FUNCTIONS -----------------------

/**
 * @param {number} date Date of the month
 * Returns all the sessions that are available (student for the session is null) on the given date
 */
async function getAllSessions(date) {
  let qry = "SELECT t.name, s.date FROM tutors t, sessions s WHERE SUBSTR(s.date, 0, POSITION(' ' IN s.date)) = $1 AND t.id = s.tutor_id AND s.student IS NULL;";
  let sessions = await pgQuery(qry, [date]);
  return sessions;
}

/**
 * Updates scheduled session in database to include student name and email
 * @param {String} name Name of user
 * @param {String} email User's email
 * @param {String[]} sessions Array of properly formatted dates to represent the scheduled sessions
 */
async function scheduleSession(name, email, sessions) {
  let qry = "UPDATE sessions SET student = $1, email = $2 WHERE date = $3;";
  await pgQuery(qry, [name, email, sessions[0]]);
  let qryTutor = "SELECT tutor_id FROM sessions WHERE date = $1";
  let tutorId = await pgQuery(qryTutor, [sessions[0]]);
  return tutorId[0].tutor_id;
  // for (let i = 0; i < sessions.length; i++) {
  //   let params = [name, email, sessions[i]];
  //   await pgQuery(qry, params);
  // }
}

// ----------------------- OAUTH FUNCTIONS --------------------------

/**
 * Stores the access token, refresh token and expiration date in the database
 * @param {String} access zoom access token
 * @param {String} refresh zoom refresh token
 * @param {integer} expiration access token expiration date (3500 sec from generation)
 */
function storeAccessToken(access, refresh, expiration) {
  let qry = "UPDATE zoom_oauth SET access_token = $1, refresh_token = $2, expiration_date = $3;";
  pgQuery(qry, [access, refresh, expiration]);
}

/**
 * Stores the Zoom meeting url in the database next to the session
 * @param {String} url Zoom meeting join link
 * @param {String} date Date of the session
 * @param {integer} tutor id of the tutor teaching the session
 */
async function storeJoinURL(url, date, tutor) {
  let qry = "UPDATE sessions SET join_url = $1 WHERE date = $2 AND tutor_id = $3";
  await pgQuery(qry, [url, date.replace("T", " "), tutor]);
}

// ----------------------- SQL QUERY FUNCTIONS -----------------------

/**
 * Executes the given query with the given parameters
 * @param {String} qry SQL syntax to be executed
 * @param {String[]} param Array of parameters for the query
 */
async function pgQuery(qry, param) {
  let client = await pool.connect();
  try {
    let res = await client.query(qry, param);
    return res.rows;
  } catch (error) {
    console.log(error);
  } finally {
    client.release();
  }
}

app.use(express.static("public"));
const PORT = process.env.PORT || 8000;
app.listen(PORT);