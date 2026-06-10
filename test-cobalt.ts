import axios from "axios";

async function test() {
  try {
      const res = await axios.post("https://api.cobalt.tools/", {
          url: "https://www.tiktok.com/@tiktok/video/7106093845943717162"
      }, {
          headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
          }
      });
      console.log(res.data);
  } catch (e) {
      console.log(e.response?.data || e.message);
  }
}
test();
