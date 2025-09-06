-- Create users table
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY,
	name VARCHAR(100) NOT NULL,
	email VARCHAR(100) NOT NULL UNIQUE,
	password VARCHAR(100) NOT NULL,
	phoneNumber VARCHAR(20),
	state VARCHAR(50)
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
	id SERIAL PRIMARY KEY,
	user_id UUID REFERENCES users(id),
	name VARCHAR(100) NOT NULL,
	description TEXT,
	date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	numberoflike INTEGER DEFAULT 0
);
