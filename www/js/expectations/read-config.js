angular.module('emission.expectations.config', ['ionic', 'emission.i18n.utils', "emission.plugin.logger", "emission.tripconfirm.services"])
.factory("ExpectationHelper", function($http, $ionicPopup, $translate, i18nUtils, Logger, ConfirmHelper) {
    // Structure based on trip-confirm-services.js
    var eh = {};
    eh.config = undefined;
    const doneRule = {trigger: 3, expect: {type: "none"}, notify: {type: "none"}};  //If all the labels are green -- we're already done

    /**
     * Find the currently scheduled collection mode
     * @returns the label field associated with the mode
     */
    eh.getCollectionModeLabel = function() {
        return this.getConfig().then((config) => {
            return getConfirmationModeBySchedule(config).label;
        });
    }

    /**
     * Get the currently scheduled collection mode's confidence threshold
     * @returns confidenceThreshold from the configuration
     */
    eh.getConfidenceThreshold = function() {
        return this.getConfig().then((config) => {
            getConfirmationModeBySchedule(config).confidenceThreshold;
        });
    };

    /**
     * Get the currently scheduled collection mode's draft delay setting
     * @returns draftDelay from the configuration
     */
    eh.getDraftDelay = function() {
        return this.getConfig().then((config) => {
            getConfirmationModeBySchedule(config).draftDelay;
        });
    };

    /**
     * Based on the current collection mode, find the expectation and notification settings for a given trip
     * @param trip A trip object in the style of infinite_scroll_list.js
     * @returns An object containing "expect" and "notify" fields with contents as in the config file
     */
    eh.getExpectationAndNotification = function(trip) {
        return this.getConfig().then((config) => {
            var rule = getRuleForTrip(getConfirmationModeBySchedule(config), trip);
            if (!rule) rule = doneRule
            return {expect: rule.expect, notify: rule.notify}
        });
    };

    /**
     * Lazily loads the configuration
     */
    eh.getConfig = function() {
        if (!angular.isDefined(this.config)) {
            return loadConfig().then(() => this.config);
        } else {
            return Promise.resolve(this.config);
        }
    }

    /**
     * Gets the config from the server
     */
    var loadConfig = function() {
        console.log("loading2");
        return $http.get("json/expectations.json")
        .then(populateConfig)
        .catch(function(err) {
            console.log("error "+JSON.stringify(err)+" while reading expectation options, reverting to defaults");
            return $http.get("json/expectations.json.sample")
            .then(populateConfig)
            .catch(function(err) {
                Logger.displayError("Error while reading default expectation options", err);
            });
        });
    }

    /**
     * Populates eh.config with the JSON from the server
     */
    var populateConfig = function(response) {
        if (response.data == undefined) throw "no data in HTTP response";
        if (response.data.length == 0) throw "data is empty in HTTP response";
        // TODO: validate against the schema (this will probably require the addition of a third-party library)
        eh.config = response.data;
    }

    /**
     * Given a config object, finds the mode that corresponds to today's date
     */
    var getConfirmationModeBySchedule = function(config) {
        const now = new Date().getTime();
        for (var i = 0; i < config.modes.length; i++) {
            if (modeMatchesDate(config.modes[i], now)) return config.modes[i];
        }
        throw "Current date does not match any modes; this means the config file lacks a schedule-less mode";
    }

    /**
     * Performs the date arithmetic to support getConfirmationModeBySchedule using moment.js
     */
    var modeMatchesDate = function(mode, date) {
        date = moment(date);
        // If the mode has no schedule, it matches all dates
        if (!("schedule" in mode)) return true;
        const firstStart = moment(mode.schedule.startDate);
        // Number of <recurrenceUnit>s since the start date
        const offset = date.diff(firstStart, mode.schedule.recurrenceUnit);
        // If it's before the start date, it doesn't match
        if (offset < 0) return false;
        // Date that the mode most recently became active
        const soonestStart = firstStart.add(offset, mode.schedule.recurrenceUnit);
        // Mode is active if it's been less than <duration> days since soonestStart
        return date.diff(soonestStart, "days") < mode.schedule.duration;
    }

    /**
     * Given a confirmation mode and a trip, finds the active rule
     */
    var getRuleForTrip = function(mode, trip) {
        rules = [];
        for (const inputType of ConfirmHelper.INPUTS) {
            const rule = getRuleForLabel(mode, trip, inputType);
            if (rule) rules.push(rule);
        }
        //The rule with the least ("reddest") trigger governs
        return rules.reduce(((prev, curr) => (curr.trigger < prev.trigger) ? curr : prev), doneRule);
    }

    /**
     * Given a confirmation mode and an input type for a given trip, finds the active rule
     */
    var getRuleForLabel = function(mode, trip, label) {
        rules = [];
        for (const rule of mode.rules) {
            if (ruleMatchesLabel(rule, trip, label)) rules.push(rule);
        }
        //The rule with the least ("reddest") trigger governs
        return rules.reduce(((prev, curr) => (curr.trigger < prev.trigger) ? curr : prev), doneRule);
    }

    /**
     * Determines whether a given rule matches a given input type in a given trip
     * @returns boolean
     */
    var ruleMatchesLabel = function(rule, trip, label) {
        //TODO: handle draft trips
        if (trip.userInput[label]) return false;  //Green labels match nothing
        //TODO: decide how the confidence threshold should play a role here
        if (!trip.finalInference[label]) return rule.trigger == -1;  //Red labels match trigger: -1
        return trip.finalInferenceConfidence <= rule.trigger;
    }

    return eh;
});