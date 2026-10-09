const CallbackLog = require("../Models/models.callback");

exports.storeCallback = async (req, res) => {
  try {
    const payload = req.body || {};
    const eventDetails = payload.event_details || {};
    const msisdn = payload.number ? String(payload.number) : null;
    const chargeResult =
      typeof eventDetails.chargeResult === "boolean"
        ? eventDetails.chargeResult ? 1 : 0
        : null;

    await CallbackLog.create({
      msisdn: msisdn,
      event_id: payload.event_id ?? null,
      bundle_id: payload.bundle_id ?? null,
      charge_result: chargeResult,

      server_tx_id: eventDetails.server_tx_id ?? null,
      amount: eventDetails.amount ?? null,
      period: eventDetails.period ?? null,
      event_time: eventDetails.time ?? null,

      headers: req.headers,
      raw_input: JSON.stringify(payload),
      client_ip: req.headers["x-real-ip"] || req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Callback received",
    });
  } catch (error) {
    console.error("Callback store error:", error);

    return res.status(500).json({
      success: false,
      message: "Callback processing failed",
    });
  }
};
