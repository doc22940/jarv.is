const axios = require("axios");

exports.handler = function (event, context, callback) {
  try {
    // attach a timer to axios to debug response time from endpoint
    // https://stackoverflow.com/questions/62186171/measure-network-latency-in-react-native/62257712#62257712
    (function (instance) {
      instance.interceptors.request.use((request) => {
        request.startTime = Date.now();
        return request;
      });

      instance.interceptors.response.use((response) => {
        response.elapsedTime = Number((Date.now() - response.config.startTime) / 1000);
        return response;
      });
    })(axios);

    // pass these URL parameters along to endpoint
    const reqQuery = event.queryStringParameters;
    reqQuery["ignore-dnt"] = "true"; // this isn't nefarious, we're not tracking in the first place!

    // pass these optional headers along to endpoint
    const reqHeaders = {
      referer: event.headers["referer"] || event.headers["Referer"] || "",
      "user-agent": event.headers["user-agent"] || event.headers["User-Agent"] || "",
    };

    // if triggered as an image without JS (i.e. from AMP pages) set `?noscript=true`
    // https://docs.simpleanalytics.com/without-javascript
    const endpointHost = "queue.simpleanalyticscdn.com";
    const endpointPath = reqQuery["noscript"] === "true" ? "noscript.gif" : "simple.gif";
    const endpointUrl = "https://" + endpointHost + "/" + endpointPath;

    axios
      .request({
        method: "GET",
        url: endpointUrl,
        headers: reqHeaders,
        params: reqQuery,
        responseType: "arraybuffer",
        timeout: 2000,
      })
      .then(function (response) {
        // parse the feedback message from endpoint
        const apiFeedback = response.headers["simple-analytics-feedback"] || "No feedback from Simple Analytics.";
        const shortFeedback = apiFeedback.toLowerCase().includes("thanks for sending ")
          ? "OK"
          : `ERROR: ${apiFeedback}`;

        console.info(`${response.status} ${response.statusText} | ${response.elapsedTime}ms | ${apiFeedback}`);

        // reasoning for base64 encoding:
        // https://community.netlify.com/t/debugging-a-function-returns-502/429/12
        callback(null, {
          statusCode: response.status,
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
            Expires: "0",
            Pragma: "no-cache",
            "x-api-feedback": shortFeedback,
            "x-api-latency": response.elapsedTime,
          },
          body: response.data.toString("base64"),
          isBase64Encoded: true,
        });
      })
      .catch(function (error) {
        // this indicates a request error, NOT an error in the endpoint's reponse
        console.error(error.message);
        callback(Error(error));
      });
  } catch (error) {
    // something went VERY wrong...
    console.error(error.message);
    callback(Error(error));
  }
};
