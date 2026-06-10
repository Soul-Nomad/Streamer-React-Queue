import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@zachking/video/6768505490263624966";
  const res = await axios.get("https://tikwm.com/api/", { params: { url, hd: 1 } });
  console.log(res.data);
}
test();
