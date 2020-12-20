require("dotenv").config();
const path = require("path");
const cors = require("cors");
const express = require("express");
const app = express();
const mapperRouter = require("./mapper");
const KiteConnect = require("kiteconnect").KiteConnect;
const KiteTicker = require("kiteconnect").KiteTicker;

const apiKey = process.env.API_KEY;
const accessToken = process.env.ACCESS_TOKEN;

const kc = new KiteConnect({
  api_key: apiKey,
});
kc.setAccessToken(accessToken);

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "build")));

app.use("/mapper", mapperRouter);

// Order function
const order = async (stock, price) => {
  const timestamp = new Date();
  console.log(
    `Placing order for ${stock.exchange}:${stock.tradingsymbol}, Transaction: ${stock.transactionType}, product: ${stock.product}, quantity: ${stock.quantity}, price: ${price}`,
  );
  console.log(`Time of order: ${timestamp.toUTCString()}`);

  return kc.placeOrder("regular", {
    exchange: stock.exchange,
    tradingsymbol: stock.tradingsymbol,
    transaction_type: stock.transactionType,
    quantity: stock.quantity,
    product: "MIS",
    price: price,
    order_type: "LIMIT",
  });

  // return `Order placed for ${stock.exchange}:${stock.tradingsymbol}, Transaction: ${stock.transactionType}, product: ${stock.product}, quantity: ${stock.quantity}`;
};

const placeOrder = async (stockArray, priceArray) => {
  const promiseArray = [];

  for (let i = 0; i < stockArray.length; i++) {
    promiseArray.push(order(stockArray[i], priceArray[i]));
  }

  await Promise.all(promiseArray);

  const positions = await kc.getPositions();
  console.log(positions);
};

app.post("/itmEntrySELL", ({ body }, response) => {
  console.log(body);
  itmEntrySell(body.stockA, body.stockB, body.entryPrice);
  response.send("Check console.");
});

app.post("/itmEntryBUY", ({ body }, response) => {
  console.log(body);
  itmEntryBuy(body.stockA, body.stockB, body.entryPrice);
  response.send("Check console.");
});

// ITM Entry Strategy (Sell)
const itmEntrySell = (stockA, stockB, entryPrice) => {
  // Extract instruments tokens for each stock
  const aToken = parseInt(stockA.instrument_token);
  const bToken = parseInt(stockB.instrument_token);
  const niftyToken = 256265;

  // Extract strike prices for each stock
  const aStrikePrice = parseInt(stockA.strike_price);
  const bStrikePrice = parseInt(stockB.strike_price);

  // Declare variables which will be updated on each tick
  let aBuyersBid, bBuyersBid, niftyPrice;

  // Flag to determine if order is already placed or not
  let placedOrder = false;

  // Entry Condition for Butterfly strategy
  const lookForEntry = () => {
    const aNet = aStrikePrice + aBuyersBid - niftyPrice;
    const bNet = niftyPrice - (bStrikePrice - bBuyersBid);

    if (aNet > 0 && bNet > 0 && aNet + bNet >= entryPrice) {
      console.log(
        `aNet: ${aNet}, bNet: ${bNet}, net: ${
          aNet + bNet
        }, Entry Price: ${entryPrice}. Condition satisfied.`,
      );
      return true;
    }

    console.log(
      `aNet: ${aNet}, bNet: ${bNet}, net: ${
        aNet + bNet
      }, Entry Price: ${entryPrice}. Condition satisfied.`,
    );
    return false;
  };

  const ticker = new KiteTicker({
    api_key: apiKey,
    access_token: accessToken,
  });

  ticker.connect();

  ticker.on("connect", () => {
    console.log("Subscribing to stocks...");
    const items = [aToken, bToken, niftyToken];
    ticker.subscribe(items);
    ticker.setMode(ticker.modeFull, items);
  });

  ticker.on("ticks", (ticks) => {
    if (!placedOrder) {
      // Check tick and update corresponding stock bid price
      // 2nd Buyer's Bid
      ticks.forEach((t) => {
        if (t.instrument_token == aToken) {
          aBuyersBid = t.depth?.buy?.[1].price;
        } else if (t.instrument_token == bToken) {
          bBuyersBid = t.depth?.buy?.[1].price;
        } else if (t.instrument_token == niftyToken) {
          niftyPrice = t.last_price;
        }
      });

      // Look for Entry
      if (lookForEntry()) {
        placedOrder = true;
        placeOrder([stockA, stockB], [aBuyersBid, bBuyersBid]);
      }
    } else if (placedOrder) {
      ticker.disconnect();
    }
  });
};

// ITM Entry Strategy (Buy)
const itmEntryBuy = (stockA, stockB, entryPrice) => {
  // Extract instruments tokens for each stock
  const aToken = parseInt(stockA.instrument_token);
  const bToken = parseInt(stockB.instrument_token);
  const niftyToken = 256265;

  // Extract strike prices for each stock
  const aStrikePrice = parseInt(stockA.strike_price);
  const bStrikePrice = parseInt(stockB.strike_price);

  // Declare variables which will be updated on each tick
  let aSellersBid, bSellersBid, niftyPrice;

  // Flag to determine if order is already placed or not
  let placedOrder = false;

  // Entry Condition for Butterfly strategy
  const lookForEntry = () => {
    const aNet = niftyPrice - (aStrikePrice + aSellersBid);
    const bNet = bStrikePrice - bSellersBid - niftyPrice;

    if (aNet > 0 && bNet > 0 && aNet + bNet >= entryPrice) {
      console.log(
        `aNet: ${aNet}, bNet: ${bNet}, net: ${
          aNet + bNet
        }, Entry Price: ${entryPrice}. Condition satisfied.`,
      );
      return true;
    }

    console.log(
      `aNet: ${aNet}, bNet: ${bNet}, net: ${
        aNet + bNet
      }, Entry Price: ${entryPrice}. Condition satisfied.`,
    );
    return false;
  };

  const ticker = new KiteTicker({
    api_key: apiKey,
    access_token: accessToken,
  });

  ticker.connect();

  ticker.on("connect", () => {
    console.log("Subscribing to stocks...");
    const items = [aToken, bToken, niftyToken];
    ticker.subscribe(items);
    ticker.setMode(ticker.modeFull, items);
  });

  ticker.on("ticks", (ticks) => {
    if (!placedOrder) {
      // Check tick and update corresponding stock bid price
      // 2nd Sellers's Bid
      ticks.forEach((t) => {
        if (t.instrument_token == aToken) {
          aSellersBid = t.depth?.sell?.[1].price;
        } else if (t.instrument_token == bToken) {
          bSellersBid = t.depth?.sell?.[1].price;
        } else if (t.instrument_token == niftyToken) {
          niftyPrice = t.last_price;
        }
      });

      // Look for Entry
      if (lookForEntry()) {
        placedOrder = true;
        placeOrder([stockA, stockB], [aBuyersBid, bBuyersBid]);
      }
    } else if (placedOrder) {
      ticker.disconnect();
    }
  });
};

app.listen(8001, () => {
  console.log("ITM Entry started on http://localhost:8001");
});
