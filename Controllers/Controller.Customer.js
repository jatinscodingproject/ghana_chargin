const User = require("../Models/models.customer");
const axios = require("axios");

const Customer = async (req, res) => {
    const {
        phone_number,
        real_ip,
        subid,
        transaction_id,
        headers: forwardedHeaders,
        origin: forwardedOrigin,
        referer: forwardedReferer,
    } = req.body;

    // Headers from the original homepage request, sent in the body.
    const headers = forwardedHeaders || req.headers;

    console.log("Request headers:", headers);
    console.log("Request body:", req.body);

    const origin = forwardedOrigin || headers.origin || null;
    const referer = forwardedReferer || headers.referer || null;

    const rawIp = req.ip;
    const clientIp = rawIp?.startsWith("::ffff:")
        ? rawIp.replace("::ffff:", "")
        : rawIp;

    try {
        if (!phone_number) {
            return res.status(400).json({
                message: "Phone number is required",
            });
        }

        if (phone_number === "NOT FOUND") {
            return res.status(404).json({
                message: "Phone number not found",
            });
        }

        const msisdn = String(phone_number).trim();
        const finalIp = real_ip || clientIp || null;

        const customerData = {
            transaction_id: transaction_id || null,
            origin,
            referer,
            client_ip: finalIp,

            host: headers.host || null,
            connection_type: headers.connection || null,
            forwarded_for: headers["x-forwarded-for"] || null,
            forwarded_proto: headers["x-forwarded-proto"] || null,
            accept_header: headers.accept || null,
            accept_language: headers["accept-language"] || null,
            accept_encoding: headers["accept-encoding"] || null,
            user_agent: headers["user-agent"] || null,

            // Avoid storing cookies or authorization headers.
            request_headers: Object.fromEntries(
                Object.entries(headers).filter(
                    ([key]) =>
                        !["cookie", "authorization", "proxy-authorization"].includes(
                            key.toLowerCase()
                        )
                )
            ),
        };

        const sameuser = await User.findOne({
            where: { msisdn },
        });

        if (sameuser) {
            await sameuser.update(customerData);

            return res.status(200).json({
                message: "Customer already exists; details updated",
                transaction_id: sameuser.transaction_id,
            });
        }

       

        const user = await User.findOne({
            where: {
                msisdn,
                origin,
                referer,
                client_ip: finalIp,
            },
        });

        if (user) {
            await user.update(customerData);

            return res.status(200).json({
                message: "Customer already found; details updated",
                transaction_id: user.transaction_id,
                origin,
                referer,
                client_ip: finalIp,
            });
        }

        const newUser = await User.create({
            msisdn,
            ...customerData,
            is_chargin: 0,
        });

        return res.status(200).json({
            message: "Customer stored successfully",
            transaction_id: newUser.transaction_id,
            origin,
            referer,
        });
    } catch (err) {
        console.error("Customer controller error:", err);

        return res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

module.exports = Customer;
