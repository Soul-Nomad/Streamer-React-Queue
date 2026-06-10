import axios from "axios";

async function test() {
  try {
      const res = await axios.post("https://co.wuk.sh/api/json", {
          url: "https://www.tiktok.com/@tiktok/video/7339794020921576737",
          aFormat: "mp4" // or vQuality
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
