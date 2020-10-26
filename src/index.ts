import { config } from "dotenv";
import { TeamSpeak, QueryProtocol } from "ts3-nodejs-library";
config();
import express, { Router } from "express";
import configObj from "./config.json"
import { dbConnect } from "./db/utils";
import { ConfigModel } from "./db/config/config.schema";

const app = express();
const api = Router();
app.use(express.json());
app.use(express.urlencoded());
app.use('/api', api)
const PORT = process.env.PORT ? process.env.PORT : 8080;

let teamspeak: TeamSpeak;

const reload = async (name) => {
  const clients = await teamspeak.clientList({ clientType: 1 });
  const whoAmi = await teamspeak.whoami();
  const worker = clients.find((el) => el.clid !== whoAmi.clientId);
  if (worker) {
    teamspeak.sendTextMessage(worker.clid, 1, process.env.COMMAND_PREFIX + "reload " + name);
  } else {
    throw new Error('Worker not found')
  }
}

api.get("/", (req, res) => res.send("Ping"));


api.post("/config/control", async (req, res) => {
  const {name, enabled} = req.body;
  try {
    const query = await ConfigModel.updateOne({name},{enabled})
    if(query.n) {
      try {
        await reload(name);
        res.send()
      } catch(e) {
        res.send();
      }
    } else {
      res.status(404).send();
    }
  } catch(e) {
    res.status(500).send(e);
  }
})


api.get("/config/all", async (req, res) => {
  let conf = { ...configObj }
  for (const el of Object.keys(conf)) {
    conf[el] = await Promise.all(conf[el].map(async (e) => {
      const query = await ConfigModel.findOne({ name: e });
      return { name: e, enabled: query?.enabled ?? null }
    }))
  }
  res.send(conf);
})

api.get("/config/:id", async (req, res) => {
  const query = await ConfigModel.findOne({name: req.params.id});
  res.send(query?.config ?? []);
});


api.post("/config/:id", async (req, res) => {
  const { config } = req.body;
  const { id } = req.params
  const query = await ConfigModel.findOne({name: id});
  const dbConf = query?.name ?? null;
  if(dbConf) {
    await ConfigModel.updateOne({_id: query?._id}, {config})
    try {
      await reload(req.params.id)
    } catch(e) {
      console.log(e)
    }
    return res.send();
  } else {
    const type = id.startsWith('command') ? "command" : id.startsWith('do') ? "invterval" : id.startsWith("get") ? "event" : null;
    if(type) {
      await new ConfigModel({name: id, type, config, enabled: false}).save();
      try {
        await reload(req.params.id)
      } catch(e) {
        console.log(e)
      }
      return res.send()
    }
  }
  return res.status(500).send();
});

api.get("/reload/:id", async (req, res) => {
  if (req.params.id !== "all") {
    try{ 
      await reload(req.params.id)
      res.send();
    } catch(e) {
      res.status(404).send()
    }
  } else {
    res.send("all");
  }
});

api.get("/servertree", async (req, res) => {
  try {
    const channels = await teamspeak.channelList();
    const tree = channels.map((el) => {
      return {
        name: el.name,
        cid: +el.cid,
        pid: +el.pid,
      };
    });

    res.send(tree);
  } catch (e) {
    console.log(e);
    res.send([]);
  }
});

api.get("/servergroups", async (req, res) => {
  try {
    const servergroups = await teamspeak.serverGroupList();
    const parsedgroups = servergroups.map((el) => {
      return {
        sgid: +el.sgid,
        name: el.name,
        icon: +el.iconid,
        type: el.type,
        sort: +el.sortid
      };
    })
    .sort((a,b) => a.sort > b.sort ? 1 : -1)

    res.send(parsedgroups);
  } catch (e) {
    console.log(e);
    res.send([]);
  }
});

api.get("/channelgroups", async (req, res) => {
  try {
    const channelgroups = await teamspeak.channelGroupList();
    const parsedgroups = channelgroups.map((el) => {
      return {
        sgid: +el.cgid,
        name: el.name,
        icon: +el.iconid,
        type: el.type,
        sort: +el.sortid
      };
    });
    res.send(parsedgroups);
  } catch (e) {
    console.log(e);
    res.send([]);
  }
});

api.get("/find", async (req, res) => {
  if (req.query.query) {
    try {
      const nickname = req.query.query.toString();
      const search = await teamspeak.clientFind(nickname);
      if (search && search.length > 0) {
        const result = await Promise.all(
          search.map(async (el) => {
            const client = await teamspeak.getClientById(el.clid);
            if (client) {
              return {
                clid: +el.clid,
                uniq: client.uniqueIdentifier,
                dbid: +client.databaseId,
                name: client.nickname,
              };
            }
            return false;
          })
        );
        res.send(result);
      } else {
        res.send([]);
      }
    } catch (e) {
      res.send([]);
    }
  } else {
    res.send([]);
  }
});

app.listen(PORT, async () => {
  console.log(`[server]: Server is running at http://localhost:${PORT}`);
  await dbConnect()
  await new Promise<void>((resolve, reject) => {
    teamspeak = new TeamSpeak({
      host: process.env.TS_IP,
      protocol: process.env.TS_QUERY_PROTO === 'RAW' ? QueryProtocol.RAW : QueryProtocol.SSH,
      queryport: process.env.TS_QUERY_PORT ? +process.env.TS_QUERY_PORT : 10011,
      serverport: process.env.TS_VOICE_PORT ? +process.env.TS_VOICE_PORT : 9987,
      username: process.env.TS_QUERY_LOGIN,
      password: process.env.TS_QUERY_PASS,
      nickname: process.env.BOT_NAME,
      keepAlive: true,
    });
  
    teamspeak.on("ready", async () => {
      console.log("[teamspeak]: Connected to teamspeak server");
      resolve()
    });
  
    teamspeak.on("error", (e) => {
      console.log(e);
      reject();
      process.exit();
    });
  })
});
