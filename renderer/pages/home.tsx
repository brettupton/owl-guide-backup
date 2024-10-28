import Link from 'next/link'
import Image from 'next/image'


export default function HomePage({ isDev }) {
  const routes = ['decision', 'adoption', 'enrollment']

  return (
    <div className="flex flex-grow items-center justify-center">
      <div className="flex flex-col text-center -mt-24">
        <Link href={`${isDev ? "/dev" : "/home"}`}>
          <Image
            className="ml-auto mr-auto"
            src="/images/owl.png"
            alt="OwlGuide Logo"
            width={110}
            height={110}
          />
        </Link>
        <span className="courgette-regular text-3xl">OwlGuide</span>
        <div className="flex flex-col mt-5 items-center">
          {routes.map((route, index) => (
            <Link
              href={`${route}`}
              key={index}
              className="bg-white hover:bg-gray-300 text-gray-800 font-semibold w-full py-2 px-4 mt-3 border border-gray-400 rounded shadow text-center active:scale-95 transition-transform duration-75"
            >
              {`${route[0].toUpperCase()}${route.slice(1)}`}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
