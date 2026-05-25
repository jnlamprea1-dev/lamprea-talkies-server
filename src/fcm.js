const config = require("./config");

let admin = null;
let fcmInitialized = false;

try {
  admin = require("firebase-admin");
} catch (e) {
  console.log("firebase-admin not available — push notifications disabled");
}

function initFCM() {
  if (!admin || !config.firebase.projectId) {
    console.log("FCM not configured — push notifications disabled");
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey,
      clientEmail: config.firebase.clientEmail,
    }),
  });

  fcmInitialized = true;
  console.log("Firebase Admin initialized");
}

async function sendPushNotification(token, title, body, data = {}) {
  if (!fcmInitialized) return false;

  const message = {
    token,
    notification: { title, body },
    data: { ...data, click_action: "OPEN_WALKIE_TALKIE" },
    android: {
      priority: "high",
      ttl: 300000,
    },
  };

  try {
    await admin.messaging().send(message);
    return true;
  } catch (err) {
    if (err.code === "messaging/invalid-registration-token" ||
        err.code === "messaging/registration-token-not-registered") {
      console.warn("Invalid FCM token:", token);
      return false;
    }
    console.error("FCM send error:", err.message);
    return false;
  }
}

module.exports = { initFCM, sendPushNotification };
