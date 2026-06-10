import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7106093845943717162";
  const res = await axios.get("https://tikwm.com/api/?url=" + encodeURIComponent(url));
  console.log(res.data);
}
test();
