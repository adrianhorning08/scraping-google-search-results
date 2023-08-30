import fetch from "node-fetch";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import chromium from "@sparticuz/chromium";
import * as cheerio from "cheerio";
import fs from "graceful-fs";
import axios from "axios";

async function getFirstPage(query) {
  try {
    const res = await fetch(
      `https://www.google.com/search?q=${query.split(" ").join("+")}`
    );
    const html = await res.text();
    // get all a tags
    const $ = cheerio.load(html);
    const aTags = $("a");
    const h3s = [];
    const links = [];
    // get all a tags that have /url?q= in them
    aTags.each((i, aTag) => {
      const href = $(aTag).attr("href");
      if (href?.includes("/url?q=")) {
        const actualUrl = href.split("/url?q=")[1].split("&sa=U&")[0];
        links.push(actualUrl);
      }
    });
    // get all h3 tags
    const h3Tags = $("h3");
    h3Tags.each((i, h3Tag) => {
      const text = $(h3Tag).text().trim();
      h3s.push(text);
    });
    const json = [];
    h3s.forEach((h3, i) => {
      json.push({ title: h3, link: links[i] });
    });

    return json;
  } catch (error) {
    console.log("error at getFirstPage", error.message);
  }
}

async function getAllResults(query) {
  try {
    puppeteerExtra.use(stealthPlugin());

    const browser = await puppeteerExtra.launch({
      headless: false,
      // devtools: true,
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    // const browser = await puppeteerExtra.launch({
    //   args: chromium.args,
    //   defaultViewport: chromium.defaultViewport,
    //   executablePath: await chromium.executablePath(),
    //   headless: "new",
    //   ignoreHTTPSErrors: true,
    // });

    const page = await browser.newPage();

    await page.goto(
      `https://www.google.com/search?q=${query.split(" ").join("+")}`
    );

    async function autoScroll(page) {
      await page.evaluate(async () => {
        let wrapper = document.querySelector("html");

        await new Promise((resolve, reject) => {
          var totalHeight = 0;
          var distance = 1000;
          var scrollDelay = 5000;

          var timer = setInterval(async () => {
            var scrollHeightBefore = wrapper.scrollHeight;
            wrapper.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeightBefore) {
              totalHeight = 0;
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));

              // Calculate scrollHeight after waiting
              var scrollHeightAfter = wrapper.scrollHeight;

              if (scrollHeightAfter > scrollHeightBefore) {
                // More content loaded, keep scrolling
                return;
              } else {
                // No more content loaded, stop scrolling
                clearInterval(timer);
                resolve();
              }
            }
          }, 100);
        });
      });
    }

    await autoScroll(page);

    await page.evaluate(() => {
      function scrollToBottom() {
        window.scrollTo(0, document.body.scrollHeight);
      }

      function clickMoreResults() {
        const h3Elements = document.querySelectorAll("h3");

        for (const h3 of h3Elements) {
          if (h3.textContent.includes("More results")) {
            h3.click();
            return true; // Indicate that the "More results" was clicked
          }
        }

        return false; // Indicate that no "More results" was found
      }

      // Function to repeatedly click and scroll
      function loadMoreResults() {
        const interval = setInterval(() => {
          const clicked = clickMoreResults();
          if (clicked) {
            scrollToBottom();
          } else {
            clearInterval(interval); // Stop the loop if no more "More results" are found
          }
        }, 1000); // Adjust the interval as needed
      }

      loadMoreResults();
    });

    await page.waitForTimeout(60000);

    const html = await page.content();
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));

    await browser.close();
    console.log("browser closed");

    const $ = cheerio.load(html);
    const h3s = [];
    const links = [];
    // get all h3 tags
    const h3Tags = $("h3");
    const all = [];
    h3Tags.each((i, h3Tag) => {
      const parent = $(h3Tag).parent();
      const link = $(parent).attr("href");
      const text = $(h3Tag).text().trim();
      h3s.push(text);
      all.push({ text, link });
    });
    const json = [];
    h3s.forEach((h3, i) => {
      json.push({ title: h3, link: links[i] });
    });

    fs.writeFileSync("./test.json", JSON.stringify(all, null, 2));
    return all;
  } catch (error) {
    console.log("error at getAllResults", error.message);
  }
}

(async () => {
  const query = "site:crunchbase.com/organization";
  const firstPage = await getFirstPage(query);
  // const results = await getAllResults(query);
})();
