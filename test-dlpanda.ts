import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7339794020921576737";
  try {
     const res = await axios.get("https://dlpanda.com/pt/url?url=" + encodeURIComponent(url));
     // it returns HTML. Let's parse HTML.
     const match = res.data.match(/<video[^>]+src="([^"]+)"/i);
     if (match) {
        console.log("Video URL:", match[1]);
     } else {
        console.log("Not found in dlpanda html");
     }
  } catch (e) {
     console.log(e.message);
  }
}
test();
