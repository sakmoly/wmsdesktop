# WMS API Backend Server

Express.js backend API server for the WMS (Warehouse Management System).

## Setup

### 1. Install Dependencies

```bash
cd wms-api
npm install
```

### 2. Configure Environment

Create a `.env` file in the `wms-api` directory:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wms_db

# Server Configuration
PORT=3000
HOST=0.0.0.0  # Bind to all network interfaces (use IP address for network access)
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

### 3. Start Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## API Endpoints

### Health Check
- `GET /health` - Server health check

### Master Data
- `GET /api/master/asns` - Get all ASNs (requires authentication)

## Project Structure

```
wms-api/
├── src/
│   ├── server.js              # Main server entry point
│   ├── routes/
│   │   ├── index.js           # Main routes file
│   │   └── masterRoutes.js    # Master data routes
│   ├── modules/
│   │   └── master/
│   │       └── masterController.js  # ASN controller
│   ├── middleware/
│   │   └── auth.js            # Authentication middleware
│   └── db/
│       └── connection.js      # Database connection pool
├── package.json
└── README.md
```

## Development

The server uses ES6 modules (`import/export`) and requires Node.js 14+.

## Troubleshooting

### Error: Cannot find module
- Make sure you ran `npm install`
- Check that all dependencies are installed

### Database Connection Error
- Verify database credentials in `.env` file
- Ensure MySQL server is running
- Check database name exists

### Port Already in Use
- Change `PORT` in `.env` file
- Or stop the process using port 3000

