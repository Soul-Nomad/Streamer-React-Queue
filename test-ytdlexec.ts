import youtubedl from 'youtube-dl-exec';

async function test() {
   try {
       const res = await youtubedl("https://www.tiktok.com/@tiktok/video/7339794020921576737", {
           dumpSingleJson: true,
           noCheckCertificates: true,
           noWarnings: true,
           preferFreeFormats: true,
           addHeader: [
               'referer:tiktok.com',
               'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
           ]
       }) as any;
       console.log("SUCCESS:", !res);
       if (res && res.url) {
          console.log("Video URL:", res.url);
       }
   } catch(e: any) {
       console.error("FAIL:", e.message);
   }
}
test();
