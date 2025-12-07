-- Grant admin privileges to admin@admin.com
UPDATE profiles 
SET role = 'admin'
WHERE email = 'admin@admin.com';