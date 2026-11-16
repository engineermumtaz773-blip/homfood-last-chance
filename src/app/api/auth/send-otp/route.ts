// Keep the existing OTP endpoint available for the profile session UI while
// exposing the explicit send-otp path requested by the auth flow.
export { DELETE, GET, POST } from "../otp/route";
