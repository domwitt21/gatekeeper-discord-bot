const DAY_MS = 24 * 60 * 60 * 1000;

class AccountRiskService {
    static evaluate(user, settings = {}, now = Date.now()) {
        const highAlertActive = Number(settings.high_alert_until) > now;
        const normalDays = Number.parseInt(settings.minimum_account_age_days, 10);
        const alertDays = Number.parseInt(settings.high_alert_minimum_account_age_days, 10);
        const configuredDays = highAlertActive
            ? Math.max(Number.isInteger(normalDays) ? normalDays : 0, Number.isInteger(alertDays) ? alertDays : 0)
            : normalDays;
        const minimumDays = Number.isInteger(configuredDays) && configuredDays > 0
            ? Math.min(configuredDays, 365)
            : 0;
        const action = highAlertActive
            ? settings.high_alert_action === "BLOCK" ? "BLOCK" : "LOG_ONLY"
            : settings.suspicious_account_action === "LOG_ONLY" ? "LOG_ONLY" : "BLOCK";
        const createdTimestamp = Number(user?.createdTimestamp);

        if (minimumDays === 0 || !Number.isFinite(createdTimestamp)) {
            return { suspicious: false, minimumDays, action, highAlertActive };
        }

        const ageMilliseconds = Math.max(0, now - createdTimestamp);
        return {
            suspicious: ageMilliseconds < minimumDays * DAY_MS,
            minimumDays,
            ageDays: Math.floor(ageMilliseconds / DAY_MS),
            action,
            highAlertActive
        };
    }
}

module.exports = AccountRiskService;
