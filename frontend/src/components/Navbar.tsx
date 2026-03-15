import { NavLink } from "react-router-dom";

export default function Navbar() {
  const linkStyle = "block px-4 py-2 rounded-lg transition";

  const activeStyle = "bg-blue-600 text-white";

  const inactiveStyle = "text-slate-700 hover:bg-slate-200";

  return (
    <aside className="w-60 bg-white shadow-md p-6 flex flex-col">
      <h1 className="text-xl font-bold mb-8 text-blue-600">PeerPrep</h1>

      <nav className="flex flex-col gap-3">
        <NavLink
          to="/home"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : inactiveStyle}`
          }
        >
          Home
        </NavLink>

        <NavLink
          to="/collab"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : inactiveStyle}`
          }
        >
          Collab
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `${linkStyle} ${isActive ? activeStyle : inactiveStyle}`
          }
        >
          Profile
        </NavLink>
      </nav>
    </aside>
  );
}
