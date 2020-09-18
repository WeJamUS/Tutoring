/* eslint-disable valid-jsdoc */
"use strict";

/*
 * User interaction for the calendar page used for scheduling meetings
 * Utilizes zoom API to create scheduled meetings
 * Utilizes smtpJS to send emails
 * Utilzies
 */
(function() {

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  window.addEventListener("load", init);

  /**
   * CHANGE: Describe what your init function does here.
   */
  async function init() {

    // await window.open("https://zoom.us/oauth/authorize?response_type=code&redirect_uri=https://blooming-wildwood-89768.herokuapp.com/authorization.html&client_id=kLkUWoLTRSWpDCcVtqADFw");
    // let authWindow = await window.open("https://zoom.us/oauth/authorize?response_type=code&redirect_uri=localhost:8000/authorization.html&client_id=kLkUWoLTRSWpDCcVtqADFw");
    fetch("/refreshToken")
      .then(checkStatus)
      .then(resp => resp.json())
      .then(function(resp) {
        if (resp.status) {
          console.log(resp.status);
        } else {
          console.log(resp);
        }
      })
      .catch(error => handleError(error));
    id("student-info").addEventListener("submit", scheduleSession);
    displayCalendar();
  }

  // ---------------------------------------- CALENDAR ----------------------------------------

  /**
   * Displays a calendar of the current month
   */
  function displayCalendar() {
    let date = new Date();
    let month = date.getMonth();
    let year = date.getFullYear();
    id("month").textContent = MONTHS[month];
    let totalDays = daysInMonth(month, year);
    let firstDay = dayOfDate(month, year, 1);
    let lastDay = dayOfDate(month, year, totalDays);
    fillDates(month, year, totalDays, firstDay, 6 - lastDay);
  }

  /**
   * Fills in the calendar with dates
   * @param {integer} month Current month
   * @param {integer} year Current year
   * @param {integer} totalDays Number of days in current month
   * @param {integer} prevDays Number of days in previous month that will appear on the calendar
   * @param {interger} nextDays Number of days in next month that will appear on the calendar
   */
  function fillDates(month, year, totalDays, prevDays, nextDays) {
    let weekNumber = 1;
    let week = id("week1");
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 0) {
      prevYear = year - 1;
      prevMonth = 11;
    }
    addFillerDays(daysInMonth(prevMonth, prevYear) - prevDays + 1, prevDays, week);
    for (let i = 1; i <= totalDays; i++) {
      if (week.children.length >= 7) {
        weekNumber++;
        week = id("week" + weekNumber);
      }
      let date = gen("div");
      date.classList.add("date");
      date.addEventListener("click", getSessions);
      let monthZero = "";
      let dayZero = "";
      if (month < 10) {
        monthZero = "0";
      }
      if (i < 10) {
        dayZero = "0";
      }
      date.id = year + "-" + monthZero + (month + 1) + "-" + dayZero + i;
      date.textContent = i;
      week.appendChild(date);
    }
    addFillerDays(1, nextDays, week);
  }

  /**
   * Adds in dates from other months to the displayed calendar
   * @param {integer} start Start date of the days from other months
   * @param {integer} days Number of days from other months
   * @param {object} week Week on the calendar that the days are added to
   */
  function addFillerDays(start, days, week) {
    for (let i = 0; i < days; i++) {
      let date = gen("div");
      date.classList.add("date");
      date.classList.add("prev-next");
      date.textContent = start + i;
      week.appendChild(date);
    }
  }

  // --------------------------------- DISPLAYING SESSIONS ---------------------------------

  /**
   * Gets the stored tutor sessions on the selected date
   */
  function getSessions() {
    let url = "/session?date=" + this.id;
    fetch(url)
      .then(checkStatus)
      .then(resp => resp.json())
      .then(displaySessions)
      .catch(error => noSessions(error));
  }

  /**
   * Displays an error message when no sessions are available on the selected day
   * @param {String} error Error message
   */
  function noSessions(error) {
    let para = gen("p");
    para.textContent = error;
    let sessionContainer = id("session-container");
    sessionContainer.innerHTML = "";
    sessionContainer.appendChild(para);
  }

  /**
   * Displays all the available sessions on the selected day
   * @param {object} resp JSON object with all available sessions on the selected day
   */
  function displaySessions(resp) {
    let sessionContainer = id("session-container");
    sessionContainer.innerHTML = "";
    let sessions = resp.sessions;
    for (let i = 0; i < sessions.length; i++) {
      let date = sessions[i].date;
      let session = gen("div");
      session.id = date;
      session.classList.add("session");
      session.addEventListener("click", selectSession);
      let name = gen("p");
      name.textContent = "Tutor: " + sessions[i].name;
      let time = gen("p");
      time.textContent = "Time: " + date.substring(date.indexOf(" ") + 1);
      session.appendChild(name);
      session.appendChild(time);
      sessionContainer.appendChild(session);
    }
  }

  // ----------------------------- SCHEDULING SESSIONS --------------------------------

  /**
   * Allows user to select and deselect the displayed sessions
   */
  function selectSession() {
    id("schedule-console").classList.remove("hidden");
    this.classList.toggle("selected");
  }

  /**
   * Schedule a session and store the user's session in database then schedule a zoom meeting
   * @param {object} e The event that occurs after a form submission
   */
  async function scheduleSession(e) {
    e.preventDefault();
    let sessions = id("session-container").children;
    let selectedSessions = [];
    for (let i = 0; i < sessions.length; i++) {
      if (sessions[i].classList.contains("selected")) {
        selectedSessions.push(sessions[i].id);
      }
    }
    if (selectedSessions.length === 0) {
      id("scheduling-feedback").textContent = "No session selected";
    } else {
      let params = new FormData();
      params.append("name", id("first-name").value + "-" + id("last-name").value);
      params.append("email", id("email").value);
      params.append("sessions", selectedSessions);
      await fetchPostJSON("/schedule", params, createMeeting);
    }
  }

  /**
   * Creates a zoom meeting and emails the join link to the user
   * @param {Object} resp Response containing info about the created zoom meeting
   */
  async function createMeeting(resp) {
    let date = resp.date.replace(" ", "T");
    await fetchGetJSON("/createMeeting?date=" + date + "&id=" + resp.id, function(meeting) {
      Email.send({
        SecureToken : "db3a1650-193a-4efd-a0b8-2534eb6f3fd2",
        To : resp.email,
        From : "sawcon46290@gmail.com",
        Subject : "Tutoring Confirmation Email",
        Body : "Hello \n your meeting id is: " + meeting.join_url
      }).then(message => alert("mail sent successfully"));
    });
  }

  // ------------------------------ OAUTH ------------------------------

  /** ------------------------------ Helper Functions  ------------------------------ */

  /**
   * Returns the number of days in the given month
   * @param {integer} month Month
   * @param {integer} year Year
   * @returns {integer} Number of days in the given month
   */
  function daysInMonth(month, year) {
    return new Date(year, month + 1, 0).getDate();
  }

  /**
   * Returns the day of the week of the given date
   * @param {integer} month Month
   * @param {integer} year Year
   * @param {integer} date Date
   * @returns {integer} The day of the week as an integer
   */
  function dayOfDate(month, year, date) {
    return new Date(year, month, date).getDay();
  }

  /**
   * Helper function that fetches from the given URL with a GET request and calls
   * a given function to incorporate the information into the webpage
   * @param {string} url URL that is fetched for
   * @param {function} func Function that will manipulate the fetched information
   */
  function fetchGetJSON(url, func) {
    fetch(url)
      .then(checkStatus)
      .then(resp => resp.json())
      .then(func)
      .catch(error => handleError(error));
  }

  /**
   * Helper function that fetches from a given URL with a POST request and passes
   * the given parameters alongside the fetch. Calls a given function to incorporate
   * the received information into the webpage
   * @param {string} url URL that is fetched for
   * @param {string[]} params Parameters that are passed alongside the fetch request
   * @param {function} func Function that will manipulate the fetched information
   * @param {function} errorFunc Error handling function
   */
  async function fetchPostJSON(url, params, func) {
    try {
      // let bodyParams = new FormData();
      // for (let i = 0; i < params.length; i += 2) {
      //   bodyParams.append(params[i], params[i + 1]);
      // }
      let resp = await fetch(url, {method: "POST", body: params});
      await checkStatus(resp);
      let info = await resp.json();
      func(info);
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Displays a message to the player indicating that a server-side error occurred.
   * @param {string} error Informative error that is displayed to the user.
   */
  function handleError(error) {
    console.log(error);
    id("error").textContent = error;
  }

  /**
   * Checks whether or not the fetch request was successful. If an error occurs, the returned
   * error message is displayed.
   * @param {object} resp Returned when fetching an API. Contains information from the fetch
   * @returns {object} Information from the fetch
   */
  async function checkStatus(resp) {
    if (resp.ok) {
      return resp;
    } else {
      let error = await resp.json();
      console.log(error);
      throw new Error(error.error);
    }
  }

  /**
   * Returns the element that has the ID attribute with the specified value.
   * @param {string} idName - element ID
   * @returns {object} DOM object associated with id.
   */
  function id(idName) {
    return document.getElementById(idName);
  }

  /**
   * Returns the first element that matches the given CSS selector.
   * @param {string} selector - CSS query selector.
   * @returns {object} The first DOM object matching the query.
   */
  function qs(selector) {
    return document.querySelector(selector);
  }

  /**
   * Returns the array of elements that match the given CSS selector.
   * @param {string} selector - CSS query selector
   * @returns {object[]} array of DOM objects matching the query.
   */
  function qsa(selector) {
    return document.querySelectorAll(selector);
  }

  /**
   * Returns a new element with the given tag name.
   * @param {string} tagName - HTML tag name for new DOM element.
   * @returns {object} New DOM object for given HTML tag.
   */
  function gen(tagName) {
    return document.createElement(tagName);
  }

})();
