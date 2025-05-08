require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const morgan = require('morgan')
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ReturnDocument, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)


app.use(cors({
  origin: ['http://localhost:5173'],
  credentials: true,
  optionSuccessStatus: 200,
}))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

app.get('/', async (req, res) => {
  res.send('Assignment-12 hello')
}
)

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token
  // console.log(token)

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' })
    }

    req.user = decoded

    next()
  }
  )
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.428x9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const matrimony = client.db('matrimony')

    const bioCollection = matrimony.collection('bio-data')
    const paymentCollection = matrimony.collection('payment')


    app.post('/jwt', async (req, res) => {
      const user = req.body

      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5h' })

      // console.log('token from jwt', token)
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        })
        .send({ success: true })
    }
    )

    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
          })
          .send({ success: true })
      }
      catch (err) {
        res.status(500).send(err)
      }
    }
    )


    //bio data collection
    app.patch('/bio-data/:id', verifyToken, async (req, res) => {
      const bioInfo = req.body
      const id = parseInt(req.params.id)
      const userEmail = req.user?.email
      // console.log(userEmail)

      if(userEmail !== bioInfo.email) return

      const filter = { bioId: id, email: userEmail }
      const existBio = await bioCollection.findOne(filter)

      if (existBio) {

        delete bioInfo._id

        bioInfo.bioId = id
        const updatedDoc = {
          $set: bioInfo
        }
        const result = await bioCollection.updateOne(filter, updatedDoc)
        res.send({ message: 'Bio updated successfully.', result })
      }
      else {
        const counter = await matrimony.collection('counters').findOneAndUpdate(
          { _id: 'bioId' },
          { $inc: { seq: 1 } },
          { returnDocument: 'after', upsert: true }
        )

        // console.log(counter)
        const result = await bioCollection.insertOne({ ...bioInfo, bioId: counter.seq })
        res.send({ message: 'New bio created.', result })

      }

    }
    )
    app.get('/bio-data', async (req, res) => {
      const limit = req.query.limit
      const type = req.query.type

      // console.log(type)
      const result = limit === 'all' && type === 'all' ? await bioCollection.find().toArray() : await bioCollection.find({ type: { $regex: `^${type}$`, $options: 'i' } }).limit(parseInt(limit)).toArray()
      res.send(result)
    }
    )
    app.get('/bio-data/:id', async (req, res) => {
      const id = req.params.id
      console.log(id)
      const query = { bioId: parseInt(id) }
      const result = await bioCollection.findOne(query)
      res.send(result)
    }
    )
    app.get('/view-bio/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const result = await bioCollection.findOne({ email: email })
      res.send(result)
    }
    )


    // stripe collection
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { money } = req.body
      console.log(money)
      const amount = parseInt(money * 100)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })

      res.send({ clientSecret: paymentIntent.client_secret })
    }
    )

    // payment collection
    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body
      console.log(payment)
      const result = await paymentCollection.insertOne(payment)
      res.send(result)
    }
    )


    // my contact request collection
    app.get('/my-contact-request', verifyToken, async (req, res) => {
      const email = req.user?.email
      const result = await paymentCollection.aggregate([
        {
          $match: {email}
        },
        {
          $lookup: {
            from: 'bio-data',
            localField: 'bioId',
            foreignField: 'bioId',
            as: 'bios'
          }
        },
        {$unwind: '$bios'},
        {
          $addFields: {
            'requested_name': '$bios.name',
            'requested_mobile': '$bios.number',
            'requested_email': '$bios.email',
          }
        },
        {
          $project: {
            bios: 0
          }
        }
      ]).toArray()
      res.send(result)
    }
    )
    app.delete('/my-contact-request/:id', verifyToken, async (req, res) => {
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await paymentCollection.deleteOne(query)
      res.send(result)
    }
    )


    // favorite collection
    app.post('/favorite', verifyToken, async (req, res) => {
      const favoriteUser = 
    }
    )


    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);



app.listen(port, () => {
  console.log(`assignment-12 running on: ${port}`)
}
)
