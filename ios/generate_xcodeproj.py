#!/usr/bin/env python3
"""Generates a clean, self-contained Xcode 27 project for CleaveIOS using FirebaseAILogic 13.2.0+."""

import pathlib

ROOT = pathlib.Path(__file__).parent
PROJ = ROOT / "CleaveIOS.xcodeproj"
SCHEMES = PROJ / "xcshareddata" / "xcschemes"
SCHEMES.mkdir(parents=True, exist_ok=True)

SOURCES = [
    ("C10000010000000000000001", "C10000020000000000000001", "CleaveIOSApp.swift"),
    ("C10000010000000000000002", "C10000020000000000000002", "CleaveModels.swift"),
    ("C10000010000000000000003", "C10000020000000000000003", "CleaveCases.swift"),
    ("C10000010000000000000004", "C10000020000000000000004", "DeterministicGate.swift"),
    ("C10000010000000000000005", "C10000020000000000000005", "HybridEngine.swift"),
    ("C10000010000000000000006", "C10000020000000000000006", "CleaveTheme.swift"),
    ("C10000010000000000000007", "C10000020000000000000007", "ContentView.swift"),
]

build_files = "\n".join(
    f"\t\t{bf} /* {name} in Sources */ = {{isa = PBXBuildFile; fileRef = {fr} /* {name} */; }};"
    for bf, fr, name in SOURCES
)
file_refs = "\n".join(
    f'\t\t{fr} /* {name} */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; name = {name}; path = CleaveIOS/Sources/{name}; sourceTree = "<group>"; }};'
    for _, fr, name in SOURCES
)
group_children = "\n".join(
    f"\t\t\t\t{fr} /* {name} */,"
    for _, fr, name in SOURCES
)
sources_phase_files = "\n".join(
    f"\t\t\t\t{bf} /* {name} in Sources */,"
    for bf, _, name in SOURCES
)

pbxproj = f"""// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 56;
	objects = {{

/* Begin PBXBuildFile section */
{build_files}
		C10000010000000000000101 /* FirebaseCore in Frameworks */ = {{isa = PBXBuildFile; productRef = C10000200000000000000001 /* FirebaseCore */; }};
		C10000010000000000000102 /* FirebaseAILogic in Frameworks */ = {{isa = PBXBuildFile; productRef = C10000200000000000000002 /* FirebaseAILogic */; }};
		C10000010000000000000103 /* FirebaseAppCheck in Frameworks */ = {{isa = PBXBuildFile; productRef = C10000200000000000000003 /* FirebaseAppCheck */; }};
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
{file_refs}
		C10000030000000000000001 /* CleaveIOS.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = CleaveIOS.app; sourceTree = BUILT_PRODUCTS_DIR; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		C10000040000000000000001 /* Frameworks */ = {{
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
				C10000010000000000000101 /* FirebaseCore in Frameworks */,
				C10000010000000000000102 /* FirebaseAILogic in Frameworks */,
				C10000010000000000000103 /* FirebaseAppCheck in Frameworks */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		C10000050000000000000001 = {{
			isa = PBXGroup;
			children = (
				C10000050000000000000002 /* Sources */,
				C10000060000000000000001 /* Products */,
			);
			sourceTree = "<group>";
		}};
		C10000050000000000000002 /* Sources */ = {{
			isa = PBXGroup;
			children = (
{group_children}
			);
			name = Sources;
			sourceTree = "<group>";
		}};
		C10000060000000000000001 /* Products */ = {{
			isa = PBXGroup;
			children = (
				C10000030000000000000001 /* CleaveIOS.app */,
			);
			name = Products;
			sourceTree = "<group>";
		}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		C10000070000000000000001 /* CleaveIOS */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = C10000080000000000000001 /* Build configuration list for PBXNativeTarget "CleaveIOS" */;
			buildPhases = (
				C10000090000000000000001 /* Sources */,
				C10000040000000000000001 /* Frameworks */,
				C10000090000000000000002 /* Bundle Optional GoogleService-Info.plist */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = CleaveIOS;
			packageProductDependencies = (
				C10000200000000000000001 /* FirebaseCore */,
				C10000200000000000000002 /* FirebaseAILogic */,
				C10000200000000000000003 /* FirebaseAppCheck */,
			);
			productName = CleaveIOS;
			productReference = C10000030000000000000001 /* CleaveIOS.app */;
			productType = "com.apple.product-type.application";
		}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		C10000100000000000000001 /* Project object */ = {{
			isa = PBXProject;
			attributes = {{
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 2720;
				LastUpgradeCheck = 2720;
			}};
			buildConfigurationList = C10000110000000000000001 /* Build configuration list for PBXProject "CleaveIOS" */;
			compatibilityVersion = "Xcode 15.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = C10000050000000000000001;
			packageReferences = (
				C10000190000000000000001 /* XCRemoteSwiftPackageReference "firebase-ios-sdk" */,
			);
			productRefGroup = C10000060000000000000001 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				C10000070000000000000001 /* CleaveIOS */,
			);
		}};
/* End PBXProject section */

/* Begin PBXShellScriptBuildPhase section */
		C10000090000000000000002 /* Bundle Optional GoogleService-Info.plist */ = {{
			isa = PBXShellScriptBuildPhase;
			alwaysOutOfDate = 1;
			buildActionMask = 2147483647;
			files = (
			);
			inputFileListPaths = (
			);
			inputPaths = (
			);
			name = "Bundle Optional GoogleService-Info.plist";
			outputFileListPaths = (
			);
			outputPaths = (
			);
			runOnlyForDeploymentPostprocessing = 0;
			shellPath = /bin/sh;
			shellScript = "PLIST=\\"${{SRCROOT}}/CleaveIOS/GoogleService-Info.plist\\"\\nif [ -f \\"$PLIST\\" ]; then\\n  cp \\"$PLIST\\" \\"${{BUILT_PRODUCTS_DIR}}/${{UNLOCALIZED_RESOURCES_FOLDER_PATH}}/GoogleService-Info.plist\\"\\n  echo \\"Bundled local GoogleService-Info.plist\\"\\nelse\\n  echo \\"warning: CleaveIOS/GoogleService-Info.plist not found; app will use in-app Firebase Settings.\\"\\nfi\\nTOKEN_FILE=\\"${{SRCROOT}}/CleaveIOS/AppCheckDebugToken.txt\\"\\nif [ -f \\"$TOKEN_FILE\\" ]; then\\n  cp \\"$TOKEN_FILE\\" \\"${{BUILT_PRODUCTS_DIR}}/${{UNLOCALIZED_RESOURCES_FOLDER_PATH}}/AppCheckDebugToken.txt\\"\\n  echo \\"Bundled local gitignored AppCheckDebugToken.txt for Simulator DEBUG\\"\\nfi\\n";
		}};
/* End PBXShellScriptBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		C10000090000000000000001 /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
{sources_phase_files}
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		C10000120000000000000001 /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				CODE_SIGNING_ALLOWED = NO;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = x86_64;
				IPHONEOS_DEPLOYMENT_TARGET = 27.0;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SUPPORTED_PLATFORMS = "iphonesimulator iphoneos";
				SWIFT_VERSION = 6.0;
			}};
			name = Debug;
		}};
		C10000120000000000000002 /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				CODE_SIGNING_ALLOWED = NO;
				ENABLE_STRICT_OBJC_MSGSEND = YES;
				"EXCLUDED_ARCHS[sdk=iphonesimulator*]" = x86_64;
				IPHONEOS_DEPLOYMENT_TARGET = 27.0;
				SDKROOT = iphoneos;
				SUPPORTED_PLATFORMS = "iphonesimulator iphoneos";
				SWIFT_VERSION = 6.0;
			}};
			name = Release;
		}};
		C10000130000000000000001 /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				CODE_SIGNING_ALLOWED = NO;
				ENABLE_USER_SCRIPT_SANDBOXING = NO;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = Cleave;
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
				IPHONEOS_DEPLOYMENT_TARGET = 27.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				PRODUCT_BUNDLE_IDENTIFIER = com.cleave.ios;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SDKROOT = iphoneos;
				SUPPORTED_PLATFORMS = "iphonesimulator iphoneos";
				SWIFT_VERSION = 6.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Debug;
		}};
		C10000130000000000000002 /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				CODE_SIGNING_ALLOWED = NO;
				ENABLE_USER_SCRIPT_SANDBOXING = NO;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = Cleave;
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
				IPHONEOS_DEPLOYMENT_TARGET = 27.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				PRODUCT_BUNDLE_IDENTIFIER = com.cleave.ios;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SDKROOT = iphoneos;
				SUPPORTED_PLATFORMS = "iphonesimulator iphoneos";
				SWIFT_VERSION = 6.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Release;
		}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		C10000110000000000000001 /* Build configuration list for PBXProject "CleaveIOS" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				C10000120000000000000001 /* Debug */,
				C10000120000000000000002 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		}};
		C10000080000000000000001 /* Build configuration list for PBXNativeTarget "CleaveIOS" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				C10000130000000000000001 /* Debug */,
				C10000130000000000000002 /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Debug;
		}};
/* End XCConfigurationList section */

/* Begin XCRemoteSwiftPackageReference section */
		C10000190000000000000001 /* XCRemoteSwiftPackageReference "firebase-ios-sdk" */ = {{
			isa = XCRemoteSwiftPackageReference;
			repositoryURL = "https://github.com/firebase/firebase-ios-sdk.git";
			requirement = {{
				kind = upToNextMajorVersion;
				minimumVersion = 13.2.0;
			}};
		}};
/* End XCRemoteSwiftPackageReference section */

/* Begin XCSwiftPackageProductDependency section */
		C10000200000000000000001 /* FirebaseCore */ = {{
			isa = XCSwiftPackageProductDependency;
			package = C10000190000000000000001 /* XCRemoteSwiftPackageReference "firebase-ios-sdk" */;
			productName = FirebaseCore;
		}};
		C10000200000000000000002 /* FirebaseAILogic */ = {{
			isa = XCSwiftPackageProductDependency;
			package = C10000190000000000000001 /* XCRemoteSwiftPackageReference "firebase-ios-sdk" */;
			productName = FirebaseAILogic;
		}};
		C10000200000000000000003 /* FirebaseAppCheck */ = {{
			isa = XCSwiftPackageProductDependency;
			package = C10000190000000000000001 /* XCRemoteSwiftPackageReference "firebase-ios-sdk" */;
			productName = FirebaseAppCheck;
		}};
/* End XCSwiftPackageProductDependency section */
	}};
	rootObject = C10000100000000000000001 /* Project object */;
}}
"""

scheme = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "2720" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "C10000070000000000000001" BuildableName = "CleaveIOS.app" BlueprintName = "CleaveIOS" ReferencedContainer = "container:CleaveIOS.xcodeproj"></BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "C10000070000000000000001" BuildableName = "CleaveIOS.app" BlueprintName = "CleaveIOS" ReferencedContainer = "container:CleaveIOS.xcodeproj"></BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
</Scheme>
"""

(PROJ / "project.pbxproj").write_text(pbxproj)
(SCHEMES / "CleaveIOS.xcscheme").write_text(scheme)
print("Generated", PROJ)
