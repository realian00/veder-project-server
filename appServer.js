var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');

var fs = require('fs');

var options = {
    key: fs.readFileSync('/etc/nginx/ssl/private/gcloudservice.biz.key'),
    cert: fs.readFileSync('/etc/nginx/ssl/certs/gcloudservice.biz.crt')
}

console.log(options)
const { MongoClient } = require("mongodb");
const url = 'mongodb+srv://realian:BAPhomet00@cluster0.bainq.mongodb.net/login?retryWrites=true&w=majority';
const client = new MongoClient(url);
const ObjectId = require('mongodb').ObjectId


var app = express();

// var https = require('https').Server(app);
var https = require('https').Server(options, app)

const io = require('socket.io')(https, options, {
    cors: {
      origin: "https://gcloudservice.biz/veder/",
      credentials: true
    },
    rejectUnauthorized: false
  });

// const io = require('socket.io')(https)


const socket = io.on("connection", (socket) => {
    console.log(socket.id);
    return socket
  });
  




app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json())
app.use(cors())





let loginData
let mainData
let concluidoData
let connected

const connection = () => {
    client.connect();
    connected = 'ok'
}

const importLoginDb = () => {
    if (connected === 'ok') {
        const db = client.db('login');
        const col = db.collection('users');
        loginData = []
        const myDoc = col.find().forEach(function (field) {
            loginData.push(field)
        })
        importMainDb()
    }
}

const importMainDb = () => {

    if (connected === 'ok') {
        const db = client.db('data');
        const col = db.collection('mainCards');
        mainData = []
        const myDoc = col.find().forEach(function (field) {
            mainData.push(field)
        })
        importConcluidoDb()
    }
}

const importConcluidoDb = () => {

    if (connected === 'ok') {
        const db = client.db('concluido');
        const col = db.collection('cards');
        concluidoData = []
        const myDoc = col.find().forEach(function (field) {
            concluidoData.push(field)
        })
    }
    console.log('count', io.engine.clientsCount)
    setTimeout(() => {
        io.emit("update", "world");
    }, 500); 
    
   
      

    
}



// LOGIN

app.post('/users', async function (req, res) {
    
    let loggedUser = 'none'
    res.setHeader('Content-Type', 'application/json');
    const loginCheck = loginData.forEach(function (field) {
        if (field.username === req.body.username && field.password === req.body.password) {
            return loggedUser = field.username
        }
    })



    console.log(loggedUser)
    return res.json({ "username": loggedUser });
})



// MAIN

app.post('/main', async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    if (req.body.col === 'mainCards') {
        res.json(mainData)
    } else if (req.body.col === 'cards') {
        res.json(concluidoData)
    }
})



//CRIAR

app.post('/postcard', async function (req, res) {
    const db = client.db('data');
    const col = db.collection('mainCards');
    const myDoc = await col.insertOne(req.body)
    res.setHeader('Content-Type', 'application/json');
    if (myDoc) {
        if (myDoc.acknowledged === true) {
            res.json('success')
        } else {
            res.json('failed')
        }
    } else {
        res.json('failed')
    }
    importLoginDb()
})



// ATUALIZAR

app.put('/atualizar', async function (req, res) {
    console.log(req.body)
    const db = client.db('data');
    const col = db.collection('mainCards');

    await col.updateOne(
        { "_id": ObjectId(`${req.body._id}`) },
        {
            $set: { 'obs': req.body.newValue, 'pendencia': req.body.pendencia }
        }
    )
    importLoginDb()

    res.setHeader('Content-Type', 'application/json');
    return res.json('success')
});



//ATUALIZAR E ENVIAR

app.put('/enviar', async function (req, res,) {
    console.log(req.body)
    let myDoc
    const db = client.db('data');
    const col = db.collection('mainCards');

    await col.updateOne(
        { "_id": ObjectId(`${req.body._id}`) },
        {
            $set: { 'obs': req.body.newValue, 'pendencia': req.body.pendencia }
        }
    )

    let parts = new Date().toISOString();
    const partsDate = parts.split('-')
    const printDate = (partsDate[0] + '-' + partsDate[1] + '-' + partsDate[2].slice(0, 2))

    if (req.body.status === 'orcamento') {
        myDoc = await col.updateOne(
            { "_id": ObjectId(`${req.body._id}`) },
            {
                $set: { 'status': 'pendente', 'orcamento': printDate }
            }
        )
    } else if (req.body.status === 'pendente') {
        myDoc = await col.updateOne(
            { "_id": ObjectId(`${req.body._id}`) },
            {
                $set: { 'status': 'aprovado', 'aprovado': printDate }
            }
        )
    } else if (req.body.status === 'aprovado') {
        const dbConcluido = client.db('concluido')
        const colConcluido = dbConcluido.collection('cards')

        const newObj = { ...req.body, status: 'concluido', concluido: printDate, pendencia: false }

        await colConcluido.insertOne(newObj)

        myDoc = await col.deleteOne({ "_id": ObjectId(`${req.body._id}`) })
    }

    importLoginDb()

    res.setHeader('Content-Type', 'application/json');
    if (myDoc) {
        if (myDoc.acknowledged === true) {
            return res.json('success')
        } else {
            return res.json('failed')
        }
    } else {
        return res.json('failed')
    }

});


// DELETE

app.delete('/delete', async function (req, res,) {
    const db = client.db('data');
    const col = db.collection('mainCards');

    const deletedDb = client.db('deleted');
    const deletedCol = deletedDb.collection('cards');

    const deletedDate = { deletedDate: new Date }

    const findDoc = await col.findOne({ "_id": ObjectId(`${req.body._id}`) })

    const deletedStamp = Object.assign(findDoc, deletedDate)

    await deletedCol.insertOne(deletedStamp)

    const myDoc = await col.deleteOne({ "_id": ObjectId(`${req.body._id}`) })

    importLoginDb()

    res.setHeader('Content-Type', 'application/json');
    console.log(myDoc)
    if (myDoc) {
        if (myDoc.acknowledged === true) {
            return res.json('success')
        } else {
            return res.json('failed')
        }
    } else {
        return res.json('failed')
    }
});





connection()
setTimeout(() => {
    importLoginDb()
}, 2000)








https.listen(3004, options, function(){
   console.log('listening on *:3004');
});