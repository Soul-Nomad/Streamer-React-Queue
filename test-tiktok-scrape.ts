import axios from "axios";

async function test() {
  const url = "https://www.tiktok.com/@tiktok/video/7339794020921576737";
  const res = await axios.get(url, {
      headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
  });

  const universalDataMatch = res.data.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)<\/script>/s);
  if (universalDataMatch) {
      const data = JSON.parse(universalDataMatch[1]);
      try {
        const itemModule = data["__DEFAULT_SCOPE__"]["webapp.video-detail"].itemInfo.itemStruct;
        const videoUrl = itemModule.video.playAddr;
        console.log("Video URL:", videoUrl.substring(0, 50));
      } catch (e) {
        console.log("Error extracting:", JSON.stringify(data["__DEFAULT_SCOPE__"]["webapp.video-detail"]));
      }
  } else {
     console.log('Not found');
  }
}
test();
