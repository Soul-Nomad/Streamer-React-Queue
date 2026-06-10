import axios from "axios";
async function test() {
  try {
     const res = await axios.get("https://www.tiktok.com/player/v1/7106093845943717162");
     console.log(res.data.substring(0, 500));
  } catch (e) {
     console.log(e.response?.status);
  }
}
test();
