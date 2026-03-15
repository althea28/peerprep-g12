export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Welcome to PeerPrep</h1>

      <p className="text-slate-600 mb-6">Hi here's the skeleton of the app.</p>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Getting Started</h2>

        <ul className="list-disc ml-5 text-slate-600 space-y-1">
          <li>what's implemented</li>
          <li>for login u can login with any email/pw</li>
          <li>
            sign up(mock): cannot use email: taken@email.com, username: admin"
          </li>
          <li>
            ^^ also i made it such that user can only enter the next field if
            previous is verified.
            <li>^ ++ live checking for field validity</li>
          </li>
          <li>
            u can try to "find a match" in collab page to see how collab room
            looks like
          </li>
          <li>
            currently, havent implemented profile page, forget password at login
            page
          </li>
          <li>
            if u wanna test pages can also just change the url /login /signup
            /home /collab /profile; currently, havent implemented profile page
          </li>
          <li>
            it's very basic implementation, come back later for updated ui!
          </li>
        </ul>
      </div>
    </div>
  );
}
