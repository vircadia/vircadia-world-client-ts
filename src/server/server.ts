import express from 'express';
import { createServer } from 'https';
import { Server } from 'socket.io';
import { ExpressPeerServer } from 'peer';
import fs from 'fs';

import { MetaRequest, WorldTransport } from '../routes/router';

const TEMP_PORT = 443;
const TEMP_ALLOWED_ORIGINS = '*';
const TEMP_ALLOWED_METHODS_REQ = 'GET, POST, PUT, DELETE, OPTIONS';
const TEMP_ALLOWED_HEADERS_REQ = 'Content-Type, Authorization';
const TEMP_ALLOWED_METHODS_WT = 'GET, POST';

function init() {
    const expressApp = express();

    // Requests via Express
    expressApp.use(function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', TEMP_ALLOWED_ORIGINS);
        res.setHeader('Access-Control-Allow-Methods', TEMP_ALLOWED_METHODS_REQ);
        res.setHeader('Access-Control-Allow-Headers', TEMP_ALLOWED_HEADERS_REQ);
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        return next();
    });

    expressApp.use('/', MetaRequest);

    const cert = fs.readFileSync("/home/ubuntu/vircadia-cert.crt");
    const key = fs.readFileSync("/home/ubuntu/vircadia-cert.key");

    // Create HTTPS server
    const expressServer = createServer({ key, cert }, expressApp);

    // Webtransport via Socket.io
    const socketIO = new Server(expressServer, {
        cors: {
            origin: TEMP_ALLOWED_ORIGINS,
            methods: TEMP_ALLOWED_METHODS_WT,
        },
    });
    WorldTransport.Router(socketIO);

    // Peer server setup
    const peerServer = ExpressPeerServer(expressServer, {
        port: TEMP_PORT,
        allow_discovery: true,
        // proxied: true,
    });
    expressApp.use('/peerjs', peerServer);

    // Launch
    expressServer.listen(TEMP_PORT, () => {
        console.log(`Server is running on port ${TEMP_PORT}`);
    });
}

void init();
