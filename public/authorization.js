/*
 * Script for zoom uri redirect page
 * Grabs zoom authorization code from search parameters and requests a zoom access tokens
 */
/* eslint-disable valid-jsdoc */
"use strict";

(function() {

  window.addEventListener("load", init);

  /**
   * Passes the returned zoom authorization code to retrieve a zoom access token
   */
  async function init() {
    let urlParams = new URLSearchParams(window.location.search);
    await fetch("/authorizationCode?authorizationCode=" + urlParams.get("code"))
      .then(checkStatus)
      .then(resp => resp.json())
      .then(() => window.close())
      .catch(handleError);
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
   * Displays a message to the player indicating that a server-side error occurred.
   * @param {string} error Informative error that is displayed to the user.
   */
  function handleError(error) {
    console.log(error.error);
  }
})();
