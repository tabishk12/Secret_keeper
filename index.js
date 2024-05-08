require('dotenv').config();
const express = require("express");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const session = require("express-session");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 9000;
const dbURI = process.env.dbURI||"mongodb+srv://secret-keeper:jkcSNYa8tIBXceRI@cluster0.apyfecq.mongodb.net/";
const secretKey = process.env.SECRET_KEY;

mongoose.connect(dbURI);
const userSchema = new mongoose.Schema({
    name: String,
    password: String,
    secrets: [{
        secret: String,
        title: String
    }]
});

const User = mongoose.model("User", userSchema);

const secretSchema = new mongoose.Schema({
    secret: String,
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
});

const Secret = mongoose.model("Secret", secretSchema);

const reviewSchema = new mongoose.Schema({
    name: String,
    email: String,
    review: String,
    rating: Number
});

const Review = mongoose.model("Review", reviewSchema);

const postSchema = new mongoose.Schema({
    title: String,
    content: String,
    author: String
});

const Post = mongoose.model("Post", postSchema);

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true
}));

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

function requireLogin(req, res, next) {
    if (req.path === '/login' || req.path === '/logout' || req.path === '/register') {
        return next();
    }

    if (req.session.loggedIn) {
        return next();
    } else {
        return res.redirect('/login');
    }
}

app.use(requireLogin);

app.get("/", async (req, res) => {
    try {
        const users = await User.find().populate('secrets');
        const secrets = users.flatMap(user => user.secrets);
        res.render("home", { loggedIn: req.session.loggedIn, users: users, secrets: secrets });
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.post('/', requireLogin, async (req, res) => {
    const { secret } = req.body;

    try {
        const user = await User.findById(req.session.userId);

        if (user) {
            if (!user.secrets) {
                user.secrets = [];
            }

            user.secrets.push({ secret: secret });
            await user.save();
            res.redirect('/');
        } else {
            console.log('User not found');
            res.render("error");
        }
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post('/login', async (req, res) => {
    const { name, password } = req.body;

    try {
        const user = await User.findOne({ name, password });

        if (user) {
            console.log('Login successful');
            req.session.loggedIn = true;
            req.session.username = user.name; // Set the username
            req.session.userId = user._id;
            res.redirect('/');
        } else {
            console.log('Login failed');
            req.session.loggedIn = false;
            res.redirect('/login');
        }
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const newUser = new User({ name: username, password, secrets: [] });
        await newUser.save();
        
        req.session.loggedIn = true;
        req.session.userId = newUser._id;

        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});
app.get("/contact", async (req, res) => {
    try {
        const reviews = await Review.find(); // Assuming you have a Review model
        res.render("contact", { reviews: reviews }); // Pass the reviews to the template
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});
// Route to handle form submission
app.post('/submit-review', async (req, res) => {
    const { name, email, review, rating } = req.body;

    try {
        const newReview = new Review({
            name: name,
            email: email,
            review: review,
            rating: parseInt(rating)
        });
        await newReview.save();
        res.redirect('/contact'); // Redirect to contact page after submission
    } catch (error) {
        console.error("Error submitting review:", error);
        res.render("error");
    }
});

app.get("/compose", (req, res) => {
    res.render("compose");
});

app.post('/compose', async (req, res) => {
    const { title, content } = req.body;

    try {
        const user = await User.findById(req.session.userId);

        if (user) {
            const existingSecret = user.secrets.find(secret => secret.secret === content && secret.title === title);
            
            if (!existingSecret) {
                const post = new Post({ title, content, author: req.session.username });
                await post.save();
                user.secrets.push({ secret: content, title: title });
                await user.save();
            }
            
            res.redirect('/secret');
        } else {
            console.log('User not found');
            res.render("error");
        }
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.get("/about", (req, res) => {
    res.render("about");
});

app.get("/secret", async (req, res) => {
    try {
        const posts = await Post.find();
        res.render("posts", { posts: posts });
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});
app.get('/read/:postId', async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);
        res.render('read', { post: post }); // passing the post object to the view
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.get("/user-secrets", async (req, res) => {
    try {
        if (!req.session.loggedIn) {
            return res.redirect("/login");
        }

        const loggedInUser = await User.findById(req.session.userId).populate('secrets');

        if (!loggedInUser) {
            return res.render("error", { message: "User not found" });
        }
        
        if (!loggedInUser.secrets || loggedInUser.secrets.length === 0) {
            return res.render("user_secrets", { user: loggedInUser, message: "No secrets found" });
        }

        res.render("user_secrets", { user: loggedInUser, secrets: loggedInUser.secrets });
    } catch (error) {
        console.error("Error fetching user secrets:", error);
        res.render("error", { message: "Error fetching user secrets" });
    }
});

app.post('/delete-secret/:id', async (req, res) => {
    const secretIdToDelete = req.params.id;

    try {
        const user = await User.findOne({ 'secrets._id': secretIdToDelete });
        
        if (user) {
            const secretIndex = user.secrets.findIndex(secret => secret._id.toString() === secretIdToDelete);
            if (secretIndex !== -1 && user.name === req.session.username) {
                user.secrets.splice(secretIndex, 1);
                await user.save();
                res.redirect("/user-secrets");
            } else {
                console.log("You are not authorized to delete this secret.");
                res.render("error");
            }
        } else {
            console.log("Secret not found");
            res.render("error");
        }
    } catch (error) {
        console.error(error);
        res.render("error");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
